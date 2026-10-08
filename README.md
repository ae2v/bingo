# Bingo AE2V

Application Web du bingo humain AE2V pour la soirée d’intégration du 17 septembre 2026, prévue pour `https://bingo.ae2v.fr`.

## Fonctionnalités livrées

- interface joueur mobile-first : inscription, grille 4×4, scan QR, saisie manuelle, code tournant, règles, progression et résultats ;
- reprise réseau : App Shell en cache, validation conservée dans IndexedDB et renvoyée automatiquement ;
- premier bingo complet attribué dans une transaction PostgreSQL ;
- tirage pondéré par lignes/colonnes, nombre de gagnants et lots configurables ;
- interface admin mobile et bureau : `DÉMARRER`, `TERMINER`, `RESET`, recherche, réinitialisation d’appareil, score de suspicion et tirage ;
- affichage public limité aux prénoms, noms complets réservés à l’administration ;
- accès administrateur via le SSO Google Workspace AE2V, cookies de session `HttpOnly`, limitation de débit, en-têtes de sécurité et audit des actions sensibles.

La direction visuelle et les captures de repérage sont dans [docs/STRATEGIE_GRAPHIQUE.md](docs/STRATEGIE_GRAPHIQUE.md).

## Lancer en local

Prérequis : Node 22+, Docker Desktop.

### Windows — lancement automatique

Double-cliquer sur [`lancer-local.bat`](lancer-local.bat). Le lanceur :

- démarre Docker Desktop si nécessaire ;
- démarre PostgreSQL et attend qu’il soit prêt ;
- crée `.env` et installe les dépendances au premier lancement ;
- applique les migrations et charge les 31 cases ;
- lance les serveurs puis ouvre automatiquement le navigateur.

### Lancement manuel

```bash
docker compose up -d db
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- joueur : `http://localhost:5173`
- admin : `http://localhost:5173/admin`
- administration : `http://localhost:5173/admin`, puis connexion avec un compte autorisé dans le SSO ; configure les variables `SSO_*` ci-dessous.

## Déployer sur bingo.ae2v.fr

1. Faire pointer l’enregistrement DNS `A` de `bingo.ae2v.fr` vers le serveur.
2. Copier `.env.production.example` vers `.env` et remplacer **toutes** les valeurs.
3. Démarrer la pile :

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy obtient et renouvelle automatiquement le certificat TLS. Remplacez les secrets cryptographiques et configurez le client OIDC avant toute mise en production hors Vercel.

Variables SSO requises : `SSO_ISSUER`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET` et `ROLE_CLAIM_NAMESPACE`. Le client doit autoriser l’URI de retour `/api/admin/callback` et attribuer le rôle `admin` à chaque administrateur du Bingo.

## Commandes de contrôle

```bash
npm test
npm run build
npm audit --omit=dev
docker compose ps
```

## Procédure événement

1. Ouvrir `/admin`, régler les lots et le nombre de gagnants.
2. Laisser les participants créer leur grille.
3. Appuyer sur **Démarrer** pour autoriser les validations.
4. À la fin, appuyer sur **Terminer**, puis **Lancer le tirage**.
5. Utiliser **Reset** uniquement pour repartir de zéro ; la confirmation exacte `RESET BINGO` est exigée.
