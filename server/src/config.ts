import 'dotenv/config';

const required = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Variable manquante: ${name}`);
  return value;
};

export const config = {
  databaseUrl: required('DATABASE_URL', 'postgres://bingo:bingo@localhost:5432/bingo'),
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  env: process.env.NODE_ENV ?? 'development',
  adminPassword: required('ADMIN_PASSWORD', 'exemplemdp'),
  cookieSecret: required('COOKIE_SECRET', 'development-cookie-secret-change-me-32'),
  masterKey: required('MASTER_KEY', 'development-master-key-change-me-32'),
  publicOrigin: process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173'
};

if (config.env === 'production' && (config.cookieSecret.startsWith('development-') || config.masterKey.startsWith('development-'))) {
  throw new Error('Production refusée avec les secrets cryptographiques temporaires. Modifie COOKIE_SECRET et MASTER_KEY.');
}
