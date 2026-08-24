# API man.artt galeries

API de livraison de galeries photo privées : la photographe gère ses galeries,
le client y accède avec un code.

## Démarrer

```bash
npm install
npx prisma db push      # crée la base SQLite et génère le client
npm run dev             # http://localhost:4000
```

### Compte photographe

Le mot de passe n'est **jamais** écrit dans un fichier : seule son empreinte
bcrypt existe, en base. On le passe à la commande, qui crée le compte ou
change le mot de passe d'un compte existant :

```bash
ACCOUNT_EMAIL="…" ACCOUNT_PASSWORD="…" ACCOUNT_NAME="…" npm run account
```

S'il n'existe qu'un seul compte, il est renommé plutôt que dupliqué : les
galeries déjà créées gardent leur propriétaire.

Le front (racine du dépôt) relaie `/api` vers ce serveur via le proxy Vite :
tout reste en same-origin, donc les cookies fonctionnent sans configuration CORS.

## Configuration (`.env`)

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Base Prisma. `file:./dev.db` en développement |
| `AUTH_SECRET` | Signature des jetons. **À régénérer pour la production** |
| `CLIENT_ORIGIN` | Origine autorisée (CORS + cookies) |
| `PORT` | Port d'écoute, 4000 par défaut |
| `UPLOAD_DIR` | Dossier de stockage des photos |

Aucun identifiant de compte ne figure dans `.env` (voir plus haut).

La configuration est validée au démarrage : un secret absent ou trop court
arrête le serveur au lieu de produire des jetons faibles en silence.

## Modèle d'accès

Deux populations, deux mécanismes, tous deux par cookie `httpOnly` :

- **Photographe** : mot de passe haché en bcrypt, jeton de session signé
  (7 jours). Protège toutes les routes `/api/galleries/*` et `/api/auth/me`.
- **Client** : aucun compte. La saisie d'un code valide dépose un jeton
  (30 jours) listant les galeries autorisées et portant un identifiant de
  visite stable, qui sert à rattacher ses favoris.

**Aucune photo n'est servie en statique.** Chaque requête sur
`/api/photos/:id/*` vérifie que le demandeur a bien le droit de voir la
galerie concernée. Connaître une URL ne suffit pas.

## Routes

### Authentification
| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/auth/login` | Connexion (10 essais / 5 min) |
| POST | `/api/auth/logout` | Déconnexion |
| GET | `/api/auth/me` | Session courante |

### Photographe (session requise)
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/galleries` | Liste des galeries |
| POST | `/api/galleries` | Création |
| GET | `/api/galleries/:id` | Détail |
| PATCH | `/api/galleries/:id` | Modification partielle |
| DELETE | `/api/galleries/:id` | Suppression (photos et fichiers compris) |
| POST | `/api/galleries/:id/photos` | Import (multipart) |
| DELETE | `/api/galleries/:id/photos/:photoId` | Retrait d'une photo |
| GET | `/api/galleries/:id/selection` | Ce que les clients ont retenu |

### Client
| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/client/access` | Saisie du code (20 essais / 5 min) |
| GET | `/api/client/gallery/:code` | Relecture via le cookie |
| GET | `/api/client/gallery/:code/favorites` | Sa sélection |
| PUT | `/api/client/favorites/:photoId` | Ajout / retrait |
| GET | `/api/client/gallery/:code/archive` | Zip, `?only=favorites` pour la sélection |

### Fichiers
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/photos/:id/thumb` | Vignette WebP 900px |
| GET | `/api/photos/:id/file` | Image d'origine |
| GET | `/api/photos/:id/download` | Téléchargement |

## Traitement des images

À l'import, `sharp` lit les dimensions réelles et fabrique la vignette. Les
dimensions viennent du serveur et non du navigateur : elles pilotent la grille
justifiée du front, une valeur fausse casserait la mise en page.
L'orientation EXIF est appliquée, sinon les photos verticales ressortent
couchées.

Les archives zip sont diffusées au fil de l'eau : rien n'est assemblé en
mémoire, une galerie de plusieurs gigaoctets passe sans faire enfler le serveur.

## Passer en production

La marche à suivre complète — VPS, nginx, systemd, certificat, sauvegarde —
est dans le **mode d'emploi de déploiement**. Les fichiers de configuration
prêts à poser vivent dans [`../deploy/`](../deploy/) :

| Fichier | Rôle |
|---|---|
| `nginx-manartt.conf` | site nginx : réécriture SPA, limite d'envoi, proxy de l'API |
| `manartt-api.service` | service systemd |
| `sauvegarde.sh` | copie quotidienne de la base **et** des photos |

Trois points à ne pas manquer :

1. **Régénérer `AUTH_SECRET`** :
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
2. **HTTPS obligatoire.** `NODE_ENV=production` active `secure` sur les
   cookies : en HTTP simple, le navigateur les jette et plus rien ne
   fonctionne, ni connexion ni galerie.
3. **Chemins absolus** pour `DATABASE_URL` et `UPLOAD_DIR`, et
   `WorkingDirectory` dans le service systemd : ils sont résolus depuis le
   dossier courant.

En mode production, l'API n'écoute que sur `127.0.0.1` et croit l'en-tête
`X-Forwarded-For` du proxy local (`trustProxy: 'loopback'`). nginx est donc la
seule porte d'entrée — c'est ce qui empêche de s'inventer une adresse pour
contourner le frein anti-force brute.

### Migrations plus tard

- **Postgres** : passer `provider` à `postgresql` dans `prisma/schema.prisma`
  et remplacer l'adaptateur par `@prisma/adapter-pg` dans `src/db.ts`.
  Aucun modèle ni aucune route ne change.
- **Stockage objet** (S3, R2) : seul `src/storage.ts` est à réécrire, les
  routes ne manipulent que des clés opaques.

## Limite connue

`npm audit` signale `deepmerge-ts` via `@prisma/config`. C'est une dépendance
**du CLI Prisma**, jamais importée par l'API à l'exécution : elle ne sert qu'à
lire `prisma.config.ts` pendant `prisma generate`. L'exploitation supposerait
un fichier de configuration malveillant, que nous fournissons nous-mêmes. Le
correctif imposerait de rétrograder Prisma en v6, incompatible avec
`@prisma/client@7`.

Le CLI figure dans `dependencies` et non `devDependencies` : un déploiement qui
installe sans les dépendances de développement doit tout de même pouvoir lancer
`prisma generate`, le client généré n'étant pas versionné.
