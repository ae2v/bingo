# Déploiement Vercel

- Projet Vercel : `ae2v/bingo`
- Dépôt source : `ae2v/bingo`, branche `main`
- Domaine prévu : `bingo.ae2v.fr`
- Base : ressource Neon `bingo-db` (données restaurées depuis la sauvegarde du 22 septembre 2026)
- Variables applicatives : `ADMIN_PASSWORD`, `COOKIE_SECRET`, `MASTER_KEY`, `PUBLIC_ORIGIN`

Les trois secrets sont gérés dans Vercel. Ne pas les ajouter au dépôt. Les commits sur `main` doivent déclencher les déploiements de production depuis GitHub.
