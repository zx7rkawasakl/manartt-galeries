# man.artt — galeries

Site de livraison de galeries photo privées pour **man.artt** (Manon, photographe en Vendée — [manartt.fr](https://manartt.fr)).

Le client reçoit un code par mail, le saisit sur la page d'accueil, et retrouve
ses photos. Il peut les mettre en favoris, répondre à la demande d'autorisation
de diffusion, puis tout télécharger — ou, sur une galerie au forfait, choisir un
nombre fixe de photos, valider son choix et n'emporter que celles-là.

## Les deux moitiés

| | |
|---|---|
| `src/` | le site : React 19, Vite, Tailwind v4, react-router |
| `server/` | l'API : Fastify 5, Prisma 7 sur SQLite, sharp pour les images |

**La documentation qui compte est dans [`server/README.md`](server/README.md)** :
installation, variables d'environnement, création du compte photographe,
schéma de la base et mise en production. Ce fichier-ci n'est qu'une porte
d'entrée.

## Démarrer

Deux terminaux, l'API d'abord (le site ne sert à rien sans elle) :

```bash
cd server && npm install && npm run db:push && npm run dev
```

```bash
npm install && npm run dev
```

Le site écoute sur `http://localhost:5173`, l'API sur le port `4000`. En
développement Vite relaie `/api` vers l'API : tout reste en même origine, les
cookies de session passent sans réglage particulier.

Pour créer le compte photographe (le mot de passe n'est jamais écrit dans un
fichier, seule son empreinte bcrypt est enregistrée) :

```bash
cd server && ACCOUNT_EMAIL="..." ACCOUNT_PASSWORD="..." npm run account
```

## Vérifications

```bash
npm run build
```

`npm run build` enchaîne le typecheck et la compilation du site. Côté serveur,
`npm run build` ne fait que le typecheck : l'API tourne sous `tsx`, sans étape
de compilation.

```bash
npm run lint
```

## Ce qu'il faut savoir avant de toucher au code

- **Aucune photo n'est servie en statique.** Chaque requête vérifie que le
  demandeur a saisi le code de la galerie, ou qu'il s'agit de la photographe
  connectée. Connaître une URL ne suffit jamais.
- **La sélection appartient à la galerie, pas à l'appareil.** Un couple qui
  choisit à deux voit la même liste, et un forfait de dix photos reste un
  forfait de dix quel que soit le nombre de téléphones qui ouvrent le lien.
- **Le droit à l'image exige une réponse, pas un accord.** « Non » ouvre le
  téléchargement exactement comme « oui » : un consentement qu'on ne peut pas
  refuser n'en est pas un.
- **Une galerie fermée l'est pour de bon.** Dépubliée ou expirée, elle ne rend
  plus ni page, ni fichier, ni archive — le cookie de visite dure trente jours
  et ne doit pas survivre à la fermeture.
