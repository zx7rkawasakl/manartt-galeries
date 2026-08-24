#!/usr/bin/env bash
# ===================================================================
#  Sauvegarde des galeries man.artt
# -------------------------------------------------------------------
#  Pourquoi les deux ensemble, et jamais l'un sans l'autre : les photos
#  sont nommees en UUID (a3f1c2...jpg). Seule la base sait quel fichier
#  appartient a quelle galerie, et sous quel nom il a ete envoye. Sans
#  elle, le dossier des photos est un tas de fichiers anonymes.
#
#  Installation :
#     sudo apt install sqlite3 rsync
#     sudo cp deploy/sauvegarde.sh /usr/local/bin/manartt-sauvegarde
#     sudo chmod +x /usr/local/bin/manartt-sauvegarde
#
#  Tous les jours a 3 h du matin (crontab -e en tant que manartt) :
#     0 3 * * * /usr/local/bin/manartt-sauvegarde >> ~/sauvegarde.log 2>&1
# ===================================================================
set -euo pipefail

SOURCE="/var/www/manartt/server"
DESTINATION="/var/sauvegardes/manartt"
GARDER_JOURS=14

BASE="$SOURCE/data/galeries.db"
PHOTOS="$SOURCE/uploads"
HORODATAGE="$(date +%Y-%m-%d_%Hh%M)"

mkdir -p "$DESTINATION/bases"

echo "[$(date '+%F %T')] debut de la sauvegarde"

# `.backup` et non `cp` : la base est peut-etre en cours d'ecriture.
# SQLite produit ici une copie coherente, sans arreter le serveur.
sqlite3 "$BASE" ".backup '$DESTINATION/bases/galeries-$HORODATAGE.db'"
echo "  base    -> galeries-$HORODATAGE.db"

# Les photos ne changent jamais une fois posees : rsync ne recopie que
# les nouvelles. Une sauvegarde quotidienne coute alors quelques secondes.
#
# `--delete` fait suivre les suppressions : une galerie effacee ne doit
# pas continuer d'occuper la sauvegarde. C'est aussi ce qui rend les
# copies de base ci-dessus indispensables — elles, sont conservees.
rsync -a --delete "$PHOTOS/" "$DESTINATION/uploads/"
echo "  photos  -> $(du -sh "$DESTINATION/uploads" | cut -f1)"

# On garde deux semaines de bases : de quoi revenir en arriere apres une
# fausse manoeuvre qu'on n'aurait pas remarquee le jour meme.
find "$DESTINATION/bases" -name 'galeries-*.db' -mtime "+$GARDER_JOURS" -delete

echo "[$(date '+%F %T')] termine"
echo ""
echo "  ATTENTION : cette sauvegarde est sur LE MEME DISQUE que le site."
echo "  Elle protege d'une fausse manoeuvre, pas d'une panne du serveur."
echo "  Recopiez $DESTINATION ailleurs (votre NAS, un autre hebergeur)."
