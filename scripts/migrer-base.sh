#!/bin/zsh
# Met à jour une base existante (Neon ou autre) avec les migrations manquantes.
# 1. sauvegarde complète (pg_dump) dans ~/Downloads ;
# 2. repère les migrations déjà appliquées (table drizzle.__drizzle_migrations, ou à défaut
#    en regardant quelles tables existent) ;
# 3. applique chaque migration manquante dans sa propre transaction et l'inscrit dans le
#    journal de drizzle, comme le ferait `drizzle-kit migrate`.
# L'adresse de la base est demandée sans s'afficher et n'est écrite nulle part.
# Usage, depuis le dossier du projet : zsh scripts/migrer-base.sh
set -euo pipefail
cd "$(dirname "$0")/.."

read -rs "URL?Adresse de la base (DATABASE_URL) : "
echo
[[ "$URL" == postgres* ]] || { echo "Adresse invalide."; exit 1; }
export PGCONNECT_TIMEOUT=20

sql() { psql "$URL" -X -v ON_ERROR_STOP=1 -At -c "$1" < /dev/null; }

echo "→ Connexion…"
sql "select 'Connecté à ' || current_database() || ' (PostgreSQL ' || current_setting('server_version') || ')'"

SAUVEGARDE=~/Downloads/sauvegarde-restaurant-$(date +%Y%m%d-%H%M).sql
echo "→ Sauvegarde complète dans $SAUVEGARDE…"
pg_dump "$URL" --no-owner --no-privileges -f "$SAUVEGARDE"
echo "  $(wc -c < "$SAUVEGARDE" | tr -d ' ') octets."

# Migration appliquée ? D'abord le journal de drizzle, sinon un indice dans le schéma.
journal=$(sql "select to_regclass('drizzle.__drizzle_migrations') is not null")
deja_appliquee() {
  local tag=$1 when=$2
  if [[ $journal == t ]]; then
    [[ $(sql "select count(*) from drizzle.__drizzle_migrations where created_at = $when") != 0 ]] && return 0
  fi
  case $tag in
    0000_*) [[ $(sql "select to_regclass('public.orders') is not null") == t ]] ;;
    0001_*|0002_*) [[ $(sql "select to_regclass('public.orders') is not null") == t ]] ;;
    0003_*) [[ $(sql "select to_regclass('public.credit_notes') is not null") == t ]] ;;
    0004_*) [[ $(sql "select to_regclass('public.attendance_records') is not null") == t ]] ;;
    0005_*) [[ $(sql "select to_regclass('public.ligdicash_invoices') is not null") == t ]] ;;
    0006_*) [[ $(sql "select to_regclass('public.staff_scoring_rules') is not null") == t ]] ;;
    *) return 1 ;;
  esac
}

echo "→ Journal drizzle présent : $journal"
sql "create schema if not exists drizzle; create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)" > /dev/null

python3 -I -c "import json;[print(e['tag'],e['when']) for e in json.load(open('drizzle/meta/_journal.json'))['entries']]" |
while read -r tag when; do
  fichier="drizzle/$tag.sql"
  hash=$(shasum -a 256 "$fichier" | cut -d' ' -f1)
  if deja_appliquee "$tag" "$when"; then
    # Déjà en place (par exemple via `drizzle-kit push`) : on l'inscrit seulement au journal.
    if [[ $(sql "select count(*) from drizzle.__drizzle_migrations where created_at = $when") == 0 ]]; then
      sql "insert into drizzle.__drizzle_migrations (hash, created_at) values ('$hash', $when)" > /dev/null
    fi
    echo "  = $tag déjà en place"
  else
    echo "  + $tag : application…"
    { echo "begin;"; cat "$fichier"; echo; echo "insert into drizzle.__drizzle_migrations (hash, created_at) values ('$hash', $when);"; echo "commit;"; } |
      psql "$URL" -X -q -v ON_ERROR_STOP=1 > /dev/null
    echo "    appliquée."
  fi
done

echo "→ Vérification…"
sql "select 'tables : ' || string_agg(t, ', ') from (values ('ligdicash_invoices'),('staff_behavior_ratings'),('staff_scoring_rules')) v(t) where to_regclass('public.' || t) is not null"
sql "select 'méthode ligdicash : ' || (count(*) > 0)::text from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'payment_method' and e.enumlabel = 'ligdicash'"
sql "select 'colonnes LigdiCash des entreprises : ' || count(*) from information_schema.columns where table_name = 'companies' and column_name like 'ligdicash%'"
echo "✓ Terminé. Sauvegarde : $SAUVEGARDE"
