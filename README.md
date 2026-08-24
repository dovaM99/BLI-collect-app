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
- identification par **code collecteur** (vérifié par caractère de contrôle), nom, prénom et **langue de collecte** ;
- dashboard de progression ;
- sessions d’annotation, brouillons automatiques et réécriture ;
- seuil minimal de mots, réglable par langue ;
- thèmes clair/sombre et interface français/anglais ;
- import d’une affectation JSON Google Drive, téléchargement **reprenable** des ZIP et cache local ;
- export compact JSON scellé, couvrant **tous** les lots travaillés sur l’appareil.

## Langue de collecte

Deux notions distinctes coexistent.

- **Langue de l’interface** (`fr` / `en`) : les libellés de l’application. Réglable à tout moment.
- **Langue de collecte** (`ln` lingala, `ktu` kituba, `kg` kikongo) : la langue dans laquelle le collecteur écrit. Choisie à l’identification, elle est **immuable pour la durée de la session** ; pour en changer, il faut se déconnecter.

Un manifeste de lot en v2 porte les trois traductions de chaque consigne. À l’installation, l’application ne charge que la consigne correspondant à la langue de collecte — les deux autres ne sont jamais écrites dans l’état persisté. Un lot ne contenant pas la langue du collecteur est refusé avec `LANGUAGE_NOT_AVAILABLE` plutôt que d’afficher une consigne dans la mauvaise langue.

Une affectation peut déclarer `"language"` : elle fait alors autorité sur le choix du collecteur, ce qui évite qu’un lot kikongo soit rempli en lingala.

La langue fait partie de la clé d’une annotation (`lot:langue:item`). Un même item peut donc être répondu dans plusieurs langues sans que la seconde réponse écrase la première — c’est ce qui rend possible le corpus parallèle sur un même jeu d’images.

## Formats des données

Chaque ZIP contient `manifest.json` à sa racine et un dossier `images/`. Le format v2 est décrit dans `docs/pack-manifest.example.json` ; le format v1 (`question` + `minWords` numérique) reste accepté pour les lots déjà distribués.

Le lien remis au collecteur pointe vers un JSON d’affectation au format `docs/assignment-manifest.example.json`. L’app télécharge et valide les ZIP un par un ; le travail devient disponible dès le premier bloc installé.

L’installation des ZIP hors ligne se teste dans Expo Go sur iOS ou Android, pas dans l’aperçu Web. Une `sequence` peut contenir moins d’éléments que `targetItems` pour une affectation de test ou livrée par étapes ; l’objectif global reste alors celui déclaré par `targetItems`. L’app n’extrait que les images référencées par l’affectation. Le SHA-256 complet est contrôlé pour les blocs jusqu’à 256 Mo ; pour les très gros ZIP, chaque fichier réellement utilisé est contrôlé avec le CRC du ZIP afin d’éviter une seconde lecture de plusieurs gigaoctets sur le téléphone.

Les manifestes ne contiennent aucune date de collecte. La période fixe de deux mois démarre au premier login local du collecteur.

## Téléchargement reprenable

Une coupure ne fait plus repartir un ZIP de zéro.

1. **Par plages** — si le serveur annonce `Accept-Ranges: bytes`, l’archive est tirée par tranches de 2 Mo, chacune écrite puis refermée sur le disque. Une coupure réseau, un délestage ou un `kill` Android ne coûtent au pire que la tranche en cours. L’état de reprise est conservé dans un fichier `.part.json` à côté du ZIP en cache.
2. **En flux continu** — repli quand le serveur ne gère pas les plages, avec sauvegarde du jeton de reprise lorsque la plateforme en fournit un.

Un lot republié sous la même URL avec une taille différente invalide automatiquement le reliquat : on ne recolle jamais deux versions.

Les erreurs de Google Drive sont désormais distinguées : quota de téléchargement épuisé (`DRIVE_QUOTA_EXCEEDED`), partage fermé (`DRIVE_ACCESS_DENIED`), étranglement (`DOWNLOAD_RATE_LIMITED`), coupure (`NETWORK_UNAVAILABLE`). Auparavant, tous ces cas s’affichaient comme « archive invalide ».

> Drive n’est pas un CDN : le quota de téléchargement d’un fichier partagé est journalier et **par fichier**. Au-delà d’une dizaine de collecteurs sur le même ZIP, prévoir des copies distinctes ou un autre hébergement.

## Export

Le fichier produit est nommé `bli_<code>_<langue>_<lot>_<horodatage>.json` et suit `docs/export.example.json`.

Points essentiels pour le dépouillement :

- **`collections[]`** — un bloc par couple **lot + langue de collecte**, avec `kind` valant `current` (le couple en cours), `previous` (déjà travaillé, remplacé depuis) ou `abandoned`. C’est la correction majeure de la v4 : jusqu’en v3, seul le lot actif sortait, et les annotations d’un lot terminé disparaissaient dès le téléchargement du lot suivant. Le découpage par langue garantit que `pack.targetLanguage` décrit réellement le contenu du bloc — sans lui, un lot travaillé successivement en deux langues produisait un en-tête qui contredisait ses propres annotations.
- **`build`** — version de l’app, plateforme, modèle d’appareil et identifiant d’installation. Permet d’isoler les exports produits par un build défectueux.
- **`collector`** — code collecteur, format et résultat du contrôle de cohérence (`codeChecksumOk`).
- **`metrics`** par annotation — temps de frappe actif, délai entre l’affichage de l’image et la première frappe (réarmé à chaque présentation, pas au premier affichage de la session), nombre d’éditions, plus gros ajout en un seul événement (`maxBurstChars`, signature d’un collage), suppressions. Un texte de 120 caractères avec `maxBurstChars: 118` et `activeMs: 900` n’a pas été écrit à la main.
- **`integrity`** — SHA-256 et taille du corps sérialisé, pour détecter une troncature après un transfert WhatsApp.

Vérification du sceau côté dépouillement :

```python
import hashlib, json

with open(chemin, encoding="utf-8") as f:
    document = json.load(f)

integrity = document.pop("integrity")
body = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
assert len(body.encode()) == integrity["bodyBytes"]
assert hashlib.sha256(body.encode()).hexdigest() == integrity["value"]
```

Le lot de démonstration porte l’identifiant `bli-demo-iyoba` : **écarter ce lot au dépouillement**, ses consignes trilingues sont des ébauches non relues.

## Schéma de stockage

L’état local est en `schemaVersion: 4`, clé `@bli-collect/state/v4`. Les états v1 à v3 sont migrés automatiquement à la première ouverture. Les profils antérieurs à la v4 n’ayant pas de code collecteur, leur nom d’utilisateur est repris comme code au format « libre » et leur langue de collecte est fixée à `ln` : toute donnée produite avant la v4 doit être revérifiée avant d’entrer dans le corpus.
