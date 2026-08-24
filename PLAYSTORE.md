# Publier Dani Mak sur le Play Store (PWA → TWA)

Ce guide suppose que ton app est déjà déployée sur une vraie URL HTTPS (ex: `https://maquis-app.vercel.app`).
Le PWA (manifest, icônes, service worker) est déjà prêt dans ce projet — il ne reste que la génération de l'app Android.

## 1. Remplacer les icônes provisoires (recommandé)

Les icônes dans `public/icons/` sont des placeholders générés automatiquement (fond orange, lettre "M").
Remplace-les par ton vrai logo avant publication, en gardant exactement les mêmes noms et tailles :
- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `icon-maskable-512.png` (512×512, logo centré dans les 60% centraux — la zone extérieure peut être rognée par Android)
- `apple-touch-icon.png` (180×180)
- `favicon.png` (32×32, à la racine de `public/`)

## 2. Installer Bubblewrap

```bash
npm install -g @bubblewrap/cli
```

Prérequis : Java JDK 17+ installé (`java -version` pour vérifier).

## 3. Générer le projet Android

```bash
bubblewrap init --manifest https://TON-DOMAINE/manifest.json
```

Bubblewrap va poser quelques questions (nom du package Android, ex: `bf.maquis.app` — utilise un format inversé de domaine unique) et générer un projet Android complet dans un nouveau dossier.

## 4. Lier ton domaine à l'app (Digital Asset Links)

C'est l'étape qui permet à Android de vérifier que TU possèdes bien le site, pour que l'app s'ouvre sans barre d'adresse Chrome visible.

Bubblewrap génère un fichier `assetlinks.json` avec les instructions exactes. Il faut le déposer sur ton domaine à cette adresse précise :
```
https://TON-DOMAINE/.well-known/assetlinks.json
```

Dans ce projet Next.js, le plus simple est de créer :
```
public/.well-known/assetlinks.json
```
avec le contenu que Bubblewrap t'indique, puis redéployer sur Vercel.

## 5. Construire l'app (fichier .aab)

```bash
bubblewrap build
```

Ça produit un fichier `app-release-signed.aab` — c'est le fichier à uploader sur le Play Store. Bubblewrap génère aussi une clé de signature (`android.keystore`) : **sauvegarde-la précieusement**, tu en auras besoin pour chaque future mise à jour de l'app. Si tu la perds, tu ne pourras plus jamais mettre à jour l'app publiée.

## 6. Créer un compte Google Play Console

- Va sur https://play.google.com/console
- Frais unique de 25 $ (paiement par carte)
- Remplis les informations de l'organisation (nom, adresse — ton entreprise au Burkina Faso)

## 7. Créer la fiche et publier

Dans Play Console :
1. « Créer une application » → nom, catégorie (Productivité / Business), gratuite
2. Renseigne la fiche store : description, captures d'écran (fais-en depuis ton téléphone une fois l'app installée en local), icône 512×512
3. Remplis les sections obligatoires : politique de confidentialité (une simple page web suffit, je peux t'aider à la rédiger si besoin), classification du contenu, public cible
4. Dans « Production » → « Créer une version » → upload le fichier `.aab` généré à l'étape 5
5. Soumets pour validation (généralement 1 à 3 jours ouvrés pour Google)

## Notes importantes

- **Mises à jour** : à chaque changement de code, tu redéploies sur Vercel (automatique via GitHub) — l'app Android se met à jour immédiatement car elle affiche ton site en direct. Tu n'as besoin de repasser par Bubblewrap/Play Console que si tu changes le manifest, l'icône, ou le nom du package.
- **Assistant IA (Ollama)** : si tu veux qu'il réponde aux questions libres (pas seulement les questions pré-programmées) depuis l'app publiée, il faudra héberger Ollama sur un serveur accessible publiquement et renseigner `OLLAMA_URL` dans Vercel — sinon l'assistant utilise automatiquement les réponses pré-calculées, qui couvrent déjà l'essentiel.
