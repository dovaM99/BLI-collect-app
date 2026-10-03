# AGENTS.md — BLI Collect

Consignes pour les agents de code qui travaillent sur ce dépôt. Lire aussi le [README](README.md), qui décrit les formats et le fonctionnement détaillé.

## Contexte

App Expo/React Native (TypeScript) de collecte d’annotations d’images en lingala (`ln`), kituba (`ktu`) et kikongo (`kg`) pour la Bantu Languages Initiative. Les collecteurs sont sur le terrain, souvent sur des téléphones Android d’entrée de gamme, **sans connexion fiable**. Tout fonctionne hors ligne ; il n’y a aucun serveur.

- Langue du code, des commentaires, des commits et de la doc : **français**.
- Interface : français par défaut (remis à chaque démarrage et déconnexion), anglais en option.
- Version courante : voir `package.json` et `app.json` (à garder synchronisées).

## Commandes de vérification

Avant de proposer un changement :

```sh
npm run typecheck
npm run test:auth
npm run test:beta
npm run test:lexicon
```

`npm run check` enchaîne le tout avec un export Web. Ces tests n’utilisent pas le réseau. Le parcours réel (stockage natif, SecureStore, partage, sélecteur de fichiers) se valide seulement sur téléphone (Expo Go ou build).

## Règles à respecter

**Données des collecteurs — ne jamais les perdre.**
- L’état persisté est en `schemaVersion: 4` (`src/services/storageState.ts`). Toute évolution du format passe par une migration qui conserve annotations, profils, sessions et horloges de collecte. Ajouter un cas dans `scripts/test-beta-pack.mjs`.
- La clé d’une annotation est `lot:langue:item` (`src/utils/annotationKey.ts`). Ne pas la changer.
- Le profil est identifié par son **code collecteur**, jamais par le nom.

**Accès collecteur (`src/auth/`).**
- Modèle 0.4.0 : confiance. Prénom + nom + langue + code personnel (4–12 chiffres) ; code collecteur `BLI…` généré par l’app ; « code oublié » = même prénom et nom (casse, espaces et forme Unicode ignorés, orthographe exacte).
- Le code personnel n’est jamais stocké en clair : SHA-256 salé dans SecureStore (`bli.pin.<code>`). Registre public des comptes : clé kv `@bli-collect/auth/v2`.
- `engine.ts` reste pur et testable sous Node (stockage et aléa injectés). Aléa : `expo-crypto.getRandomValues`, jamais `Math.random` pour un secret.
- L’ancien mécanisme d’autorisations signées (0.3.0) a été supprimé volontairement ; une vérification par **serveur** le remplacera. Ne pas le réintroduire.

**Exports (`src/services/dataFiles.ts`).**
- Format compact v4 scellé par SHA-256 (`integrity`). Un export ne contient que le travail du collecteur connecté. Garder la compatibilité avec `docs/export.example.json`.

**Contenu.**
- Lexique : modifier `lexicon/*.csv`, puis `npm run build:lexicon`. Ne pas éditer `src/data/lexiconEntries.json` à la main. Ne jamais retirer les accents du lingala.
- Photos bêta : registre dans `docs/beta-photo-sources.json`, puis `npm run build:beta-photos`. Chaque photo garde auteur, licence et source.

**Android.**
- Pas de permission inutile dans `app.json`.
- Identifiant Play : `com.bantulanguagesinitiative.bli_collect`. Ne pas changer l’identifiant ni la clé de signature (gérée par EAS).
- Build `.aab` : EAS local sur le Mac, profil `production` (voir `docs/beta-0.4.0.md`). `versionCode` est géré à distance par EAS.

## Ne pas committer

`node_modules/`, `dist/`, `dist-android/`, `.expo/`, les `.aab`/`.apk`, `_to_delete/`, `charts/`, ni aucun fichier de données de collecteurs (exports JSON réels).

## Git

Une branche par sujet (`feat/…`, `fix/…`), puis pull request vers `main`. Messages de commit en français, au format `type(portée): résumé`.
