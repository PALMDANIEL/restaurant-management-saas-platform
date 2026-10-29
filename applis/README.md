# Applications Dani Mak (Windows, macOS, Android)

Les trois applications ouvrent la plateforme en ligne (https://restaurant-management-saas-platform.vercel.app).
Les mises à jour du site arrivent donc sans réinstaller l'application.

## Windows et macOS (`bureau/`, Electron)

    cd applis/bureau
    npm install
    npx electron-builder --mac --x64      (Mac Intel)
    npx electron-builder --mac --arm64    (Mac Apple Silicon)
    npx electron-builder --win --x64      (Windows, se construit aussi depuis un Mac)

Fichiers produits dans `bureau/release/`. Autre serveur : variable `DANIMAK_URL`.

## Android (`android/`, Capacitor 8)

Il faut Java 21 et le SDK Android. La clé de signature est hors du dépôt, dans `~/.danimak/` :
**à sauvegarder**, sinon les téléphones refuseront les mises à jour.

    cd applis/android
    npm install
    npx cap sync android
    cd android
    DANIMAK_KEYSTORE=~/.danimak/danimak.jks DANIMAK_KEYSTORE_PASSWORD="$(cat ~/.danimak/mot-de-passe-cle.txt)" ./gradlew assembleRelease

APK : `android/android/app/build/outputs/apk/release/app-release.apk`.
Pour le Play Store : `./gradlew bundleRelease` (fichier .aab), voir PLAYSTORE.md.
