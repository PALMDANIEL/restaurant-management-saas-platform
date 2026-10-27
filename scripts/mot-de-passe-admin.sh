#!/bin/zsh
# Choisit le mot de passe de l'administrateur de la plateforme (PLATFORM_ADMIN_PASSWORD_HASH)
# et l'enregistre sur Vercel pour la production. Le mot de passe n'est ni affiché ni stocké :
# seule son empreinte bcrypt est envoyée à Vercel.
# Usage, depuis le dossier du projet (dépendances installées, projet lié à Vercel) :
#   zsh scripts/mot-de-passe-admin.sh [chemin de la commande vercel]
set -euo pipefail
cd "$(dirname "$0")/.."
VERCEL=${1:-vercel}

read -rs "MDP?Nouveau mot de passe administrateur plateforme (12 caractères au moins) : "
echo
read -rs "MDP2?Le même, une seconde fois : "
echo
[[ "$MDP" == "$MDP2" ]] || { echo "Les deux saisies diffèrent, rien n'a été changé."; exit 1; }
(( ${#MDP} >= 12 )) || { echo "Trop court (12 caractères au moins), rien n'a été changé."; exit 1; }

HASH=$(MDP="$MDP" node -e "console.log(require('bcryptjs').hashSync(process.env.MDP, 12))")
unset MDP MDP2

"$VERCEL" env rm PLATFORM_ADMIN_PASSWORD_HASH production --yes > /dev/null 2>&1 || true
printf '%s' "$HASH" | "$VERCEL" env add PLATFORM_ADMIN_PASSWORD_HASH production --sensitive > /dev/null
echo "✓ Mot de passe administrateur enregistré sur Vercel (production). Revenez à la conversation."
