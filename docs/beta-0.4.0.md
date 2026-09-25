# BLI Collect 0.4.0 — accès simplifié

Application Google Play : `com.bantulanguagesinitiative.bli_collect`.
Le fichier à importer dans Play Console est un **Android App Bundle (.aab)**. Le profil EAS `production` produit ce fichier signé ; le nom du profil ne publie pas l’app en production.

## Notes de version à copier dans Play Console

Connexion simplifiée : prénom, nom, langue et code personnel, sans fichier à échanger. Réouverture avec le code personnel seul, et « Code oublié » pour en choisir un nouveau. Les travaux déjà enregistrés sont conservés lors de la mise à jour.

## Préparer les collecteurs

Rien à préparer côté coordinateur : chaque collecteur s’inscrit directement dans l’app. Les collecteurs déjà activés en 0.3.0 retrouvent leur nom et leur travail et choisissent un nouveau code personnel en confirmant leur prénom et leur nom. Voir [Accès collecteur](../README.md#accès-collecteur).

## Construire une nouvelle version

### Sur le Mac, avec EAS Build local

Les versions Android précédentes ont été construites avec **EAS Build local**. Java 17 et le SDK Android sont déjà installés sur le Mac du coordinateur. Depuis le dossier du projet :

```sh
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"
npx eas-cli@latest build --platform android --profile production --local --output dist-android/BLI-Collect-0.4.0-google-play.aab
```

Le chemin Java ci-dessus correspond à l'installation Homebrew de ce Mac. La compilation s'exécute sur l'ordinateur, sans attendre un serveur de compilation Expo. Une connexion Internet reste nécessaire pour récupérer les dépendances, la clé de signature Android gérée par EAS et le numéro de version. Le fichier `.aab` est enregistré dans `dist-android/` ; il n'est pas envoyé à Google Play automatiquement.

Prévoir environ 10 Go d'espace libre pour travailler confortablement, surtout après une mise à jour d'Expo : Gradle doit télécharger de nouveaux outils et créer des fichiers temporaires. Une erreur `No space left on device` signifie que le disque est plein.

### Sur les serveurs Expo

```sh
npm run check
npx eas-cli@latest build --platform android --profile production
```

EAS conserve la clé de signature Android déjà utilisée. Le numéro interne Android (`versionCode`) est géré à distance et incrémenté automatiquement pour chaque construction de ce profil. Ne pas modifier l’identifiant de l’app ni remplacer sa clé de signature pour une mise à jour.

Le profil `preview` reste disponible pour produire un APK à installer directement sur un téléphone, en dehors du parcours Google Play.

## Créer la version de test dans Play Console

1. Ouvrir la fiche BLI Collect correspondant à l’identifiant ci-dessus.
2. Ouvrir la piste de test interne ou fermé destinée aux collecteurs, puis créer une version.
3. Importer le nouveau fichier `.aab`, donner un nom à la version et coller les notes ci-dessus.
4. Vérifier la liste ou le groupe de testeurs, contrôler les éléments demandés par Play Console, puis lancer la distribution de cette version de test.
5. Communiquer le lien de participation aux testeurs. Après installation, chacun s’inscrit avec son prénom, son nom et son code personnel.

Référence : [construire un AAB pour Google Play avec Expo](https://docs.expo.dev/tutorial/eas/android-production-build/).
