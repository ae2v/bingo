CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE game_state AS ENUM ('WAITING', 'RUNNING', 'ENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE validation_status AS ENUM ('CONFIRMED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  event_date date NOT NULL,
  state game_state NOT NULL DEFAULT 'WAITING',
  raffle_winner_count integer NOT NULL DEFAULT 3 CHECK (raffle_winner_count BETWEEN 1 AND 50),
  raffle_prize_label text NOT NULL DEFAULT 'une consommation au bar',
  first_full_prize_label text NOT NULL DEFAULT 'un pull de l’IUT offert par AE2V',
  max_raffle_entries integer NOT NULL DEFAULT 3 CHECK (max_raffle_entries BETWEEN 1 AND 8),
  exclude_first_from_raffle boolean NOT NULL DEFAULT true,
  first_full_winner_id uuid,
  first_full_winner_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bingo_cases (
  id bigserial PRIMARY KEY,
  text text NOT NULL UNIQUE,
  category text NOT NULL,
  difficulty integer NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  first_normalized text NOT NULL,
  last_normalized text NOT NULL,
  device_token_hash text,
  code_secret bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, first_normalized, last_normalized)
);
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_first_full_winner_fk;
ALTER TABLE events ADD CONSTRAINT events_first_full_winner_fk FOREIGN KEY (first_full_winner_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS grids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS grid_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grid_id uuid NOT NULL REFERENCES grids(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 15),
  case_id bigint NOT NULL REFERENCES bingo_cases(id),
  validated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  admin_validated boolean NOT NULL DEFAULT false,
  validated_at timestamptz,
  UNIQUE(grid_id, position)
);
ALTER TABLE grid_items ADD COLUMN IF NOT EXISTS admin_validated boolean NOT NULL DEFAULT false;
DROP INDEX IF EXISTS one_person_per_grid;
CREATE INDEX IF NOT EXISTS validations_by_person_per_grid ON grid_items(grid_id, validated_by) WHERE validated_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS validation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id uuid REFERENCES users(id) ON DELETE SET NULL,
  grid_item_id uuid NOT NULL REFERENCES grid_items(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  status validation_status NOT NULL,
  reason text,
  scanned_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, client_id)
);

CREATE TABLE IF NOT EXISTS raffle_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  prize_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS raffle_winners (
  draw_id uuid NOT NULL REFERENCES raffle_draws(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position integer NOT NULL,
  entries integer NOT NULL,
  PRIMARY KEY(draw_id, user_id),
  UNIQUE(draw_id, position)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  actor_type text NOT NULL,
  actor_id text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_name_search ON users(event_id, first_normalized, last_normalized);
CREATE INDEX IF NOT EXISTS attempts_owner_time ON validation_attempts(owner_id, created_at DESC);
