# BLI Collect

Application Expo hors-ligne destinée aux annotateurs de la Bantu Languages Initiative.

## Lancer dans Expo Go

```bash
npm install
npm start
```

Scannez ensuite le QR code avec Expo Go. Le projet utilise Expo SDK 54 pour rester compatible avec la version courante d’Expo Go durant la transition SDK 57.

## Parcours disponible

- onboarding affiché une seule fois ;
- profil local avec trois champs obligatoires ;
- dashboard de progression ;
- sessions d’annotation, brouillons automatiques et réécriture ;
- seuil minimal de mots progressif ;
- thèmes clair/sombre et interface français/anglais ;
- import d’une affectation JSON Google Drive, téléchargement progressif des ZIP et cache local ;
- export compact JSON des annotations complètes ou partielles.

## Formats des données

Chaque ZIP contient `manifest.json` à sa racine et un dossier `images/`. Le format interne est décrit dans `docs/pack-manifest.example.json`.

Le lien remis au collecteur pointe vers un JSON d’affectation au format `docs/assignment-manifest.example.json`. L’app télécharge et valide les ZIP un par un ; le travail devient disponible dès le premier bloc installé.

L’installation des ZIP hors ligne se teste dans Expo Go sur iOS ou Android, pas dans l’aperçu Web. Une `sequence` peut contenir moins d’éléments que `targetItems` pour une affectation de test ou livrée par étapes ; l’objectif global reste alors celui déclaré par `targetItems`. L’app n’extrait que les images référencées par l’affectation. Le SHA-256 complet est contrôlé pour les blocs jusqu’à 256 Mo ; pour les très gros ZIP, chaque fichier réellement utilisé est contrôlé avec le CRC du ZIP afin d’éviter une seconde lecture de plusieurs gigaoctets sur le téléphone.

Les manifestes ne contiennent aucune date de collecte. La période fixe de deux mois démarre au premier login local du collecteur.
