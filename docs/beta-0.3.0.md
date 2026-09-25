# BLI Collect 0.3.0 — nouvelle campagne bêta

Application Google Play : `com.bantulanguagesinitiative.bli_collect`.
Le fichier à importer dans Play Console est un **Android App Bundle (.aab)**. Le profil EAS `production` produit ce fichier signé ; le nom du profil ne publie pas l’app en production.

## Notes de version à copier dans Play Console

100 photos disponibles hors ligne pour la collecte en lingala, kituba et kikongo. Activation du téléphone par une autorisation BLI, puis ouverture avec un code personnel. La session reste ouverte lors des changements d’application. Les exports signés peuvent être contrôlés par le coordinateur. Les travaux déjà enregistrés sont conservés lors de la mise à jour.

## Préparer les collecteurs

Chaque installation doit préparer sa propre demande d’accès. Le coordinateur l’importe dans l’outil local, vérifie l’identité et génère l’autorisation correspondante. Une autorisation créée dans Expo Go ne remplace pas celle de l’app installée depuis Google Play.

La clé publique BLI est intégrée dans cette version. La clé privée et le registre du coordinateur restent sur son ordinateur. (Mécanisme retiré en 0.4.0.)

## Construire une nouvelle version

### Sur le Mac, avec EAS Build local

Les versions Android précédentes ont été construites avec **EAS Build local**. Java 17 et le SDK Android sont déjà installés sur le Mac du coordinateur. Depuis le dossier du projet :

```sh
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"
npm run check:auth-config
npx eas-cli@latest build --platform android --profile production --local --output dist-android/BLI-Collect-0.3.0-google-play.aab
```

Le chemin Java ci-dessus correspond à l'installation Homebrew de ce Mac. La compilation s'exécute sur l'ordinateur, sans attendre un serveur de compilation Expo. Une connexion Internet reste nécessaire pour récupérer les dépendances, la clé de signature Android gérée par EAS et le numéro de version. Le fichier `.aab` est enregistré dans `dist-android/` ; il n'est pas envoyé à Google Play automatiquement.

Prévoir environ 10 Go d'espace libre pour travailler confortablement, surtout après une mise à jour d'Expo : Gradle doit télécharger de nouveaux outils et créer des fichiers temporaires. Une erreur `No space left on device` signifie que le disque est plein.

### Sur les serveurs Expo

```sh
npm run check
npm run check:auth-config
npx eas-cli@latest build --platform android --profile production
```

EAS conserve la clé de signature Android déjà utilisée. Le numéro interne Android (`versionCode`) est géré à distance et incrémenté automatiquement pour chaque construction de ce profil. Ne pas modifier l’identifiant de l’app ni remplacer sa clé de signature pour une mise à jour.

Le profil `preview` reste disponible pour produire un APK à installer directement sur un téléphone, en dehors du parcours Google Play.

## Créer la version de test dans Play Console

1. Ouvrir la fiche BLI Collect correspondant à l’identifiant ci-dessus.
2. Ouvrir la piste de test interne ou fermé destinée aux collecteurs, puis créer une version.
3. Importer le nouveau fichier `.aab`, donner un nom à la version et coller les notes ci-dessus.
4. Vérifier la liste ou le groupe de testeurs, contrôler les éléments demandés par Play Console, puis lancer la distribution de cette version de test.
5. Communiquer le lien de participation aux testeurs. Après installation, chacun suit le parcours d’activation BLI.

Référence : [construire un AAB pour Google Play avec Expo](https://docs.expo.dev/tutorial/eas/android-production-build/).
