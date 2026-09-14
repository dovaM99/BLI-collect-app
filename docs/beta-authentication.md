# Activation BLI hors ligne — version bêta

Implémentation du 14 septembre 2026. Aucun compte distant, aucun service d’authentification hébergé. Le coordinateur utilise une interface locale sur son ordinateur ; les collecteurs utilisent l’app Android/iOS.

## Première utilisation du coordinateur

Dans le dossier du projet :

```sh
npm install
npm run authority
```

Ouvrir http://127.0.0.1:8741. Choisir le nom de l’autorité et un mot de passe d’au moins 12 caractères. Il doit être saisi directement dans l’outil, pas dans une conversation.

L’outil crée une clé Ed25519, protège sa partie privée avec le mot de passe et écrit **uniquement la clé publique** dans `src/auth/trusted-issuers.json`. Ce fichier public doit être conservé dans Git et intégré à l’app. Recharger Expo après cette première configuration. Une app déjà installée en APK devra être reconstruite si sa liste de clés publiques doit changer.

Les informations privées restent, par défaut, dans `~/.bli-collect-authority/`, en dehors du projet :

- `vault.json` : clé privée chiffrée par AES-256-GCM ; clé de chiffrement dérivée du mot de passe par scrypt (N=32768, r=8, p=1, sel aléatoire de 16 octets).
- `registry.json` : autorisations, révocations et empreintes des exports contrôlés, avec signature d’intégrité BLI. Il contient des identités ; les permissions du dossier sont 0700 et celles des fichiers 0600.
- `process.lock` : empêche deux instances d’écrire simultanément dans le même registre.

Le bouton **Sauvegarder l’outil** télécharge une sauvegarde signée contenant la clé chiffrée et le registre. La conserver sur un autre support sûr. Refaire cette sauvegarde après émission ou révocation d’accès. Le mot de passe et la sauvegarde sont tous deux nécessaires à la restauration. Un registre ancien peut réintroduire des décisions anciennes : toujours restaurer la sauvegarde la plus récente.

L’outil se verrouille après 15 minutes sans opération. Il écoute exclusivement sur `127.0.0.1`, vérifie Host et Origin, utilise un jeton contre les requêtes provenant d’autres pages et ne charge aucun service ni script extérieur. C’est un processus local à démarrer, pas un serveur à héberger. Les clés de signature ne sont jamais renvoyées au navigateur en clair.

## Parcours collecteur

La préparation et le partage d’une demande sont possibles même si l’outil du coordinateur n’a pas encore été initialisé. La demande reste enregistrée après rechargement. La clé publique BLI reste obligatoire pour importer une autorisation et activer l’accès ; l’app explique l’étape manquante si elle n’est pas encore configurée.

1. Ouvrir l’app et préparer une demande avec le code collecteur, le nom, le prénom, le pseudo et la langue (lingala, kituba ou kikongo).
2. L’app crée une clé privée propre à cette demande dans le stockage protégé du téléphone. Elle signe la demande avec cette clé pour prouver qu’elle en détient la partie privée.
3. Partager le fichier de demande avec le coordinateur, par le moyen disponible : transfert de fichiers, courriel, WhatsApp ou USB. La demande contient la clé **publique** du téléphone, jamais la clé privée.
4. Dans l’outil local, ouvrir la demande, vérifier l’identité et la langue, choisir la campagne et générer l’autorisation. Si ce code possède déjà un accès, le remplacement doit être explicitement coché ; l’ancien accès est révoqué dans le même enregistrement.
5. Remettre le fichier d’autorisation au collecteur. Dans l’app, **Importer mon autorisation**, vérifier le récapitulatif, puis choisir et confirmer un code personnel de 8 à 12 chiffres.
6. L’app vérifie la signature BLI, l’identité, la demande correspondante et la possession de la clé privée du téléphone. Ensuite, les ouvertures se font hors ligne avec le code personnel.

Le code collecteur sert toujours à retrouver le travail antérieur sur le même appareil ; il ne suffit plus à ouvrir un espace. Le caractère de contrôle des anciens codes BLI reste une vérification de format, pas une preuve d’identité.

La langue est approuvée par l’autorisation. Une affectation dans une autre langue est refusée. Lorsqu’on ouvre un compte d’une autre langue et que le lot téléchargé ne correspond pas, l’app revient au lot bêta embarqué ; le registre et les annotations des lots précédents restent conservés.

## Test sur téléphone, avant commit et APK

1. Initialiser l’outil local et télécharger sa sauvegarde.
2. Lancer `npm start -- --lan` et ouvrir le projet avec une version d’Expo Go compatible avec le SDK 57. Le téléphone et l’ordinateur doivent pouvoir communiquer sur le réseau local. Recharger l’app après création de la clé publique.
3. Créer une demande de test sur le téléphone. La partager vers l’ordinateur, générer son autorisation et la transférer vers le téléphone.
4. Activer avec un code personnel. Passer en mode avion et produire une annotation sur les 100 photos embarquées.
5. Passer à une autre app puis revenir : l’espace reste ouvert, sans nouveau calcul du code. Fermer complètement l’app puis la relancer : le code est demandé et le travail reste présent. Un code erroné doit échouer. Vérifier aussi la déconnexion volontaire.
6. Exporter le travail et ouvrir le fichier dans **Vérifier un export**. Le rapport doit identifier le collecteur, la campagne et les annotations produites sous cet accès. Un fichier modifié doit être refusé.

L’aperçu Web affiche le parcours mais **ne crée pas de clés et ne permet pas une activation**. Il n’utilise pas localStorage comme remplacement du stockage protégé. Les opérations natives (stockage, partage, sélecteur de fichiers) doivent être validées sur le téléphone. Aucun APK n’est généré par ces commandes.

Après validation du test, conserver les modifications et la clé publique dans le commit. La construction EAS exécute `check:auth-config` et refuse une bêta dépourvue de clé publique BLI. La clé privée et le registre ne sont pas nécessaires au build et ne doivent pas être envoyés à EAS ou à Git.

## Exports signés et contrôle

Le fichier exporté a cette enveloppe :

```text
format: "bli-signed-export"
version: 1
 authorization: autorisation BLI complète avec sa signature
 payload: export compact v4 (collector, collections, build, totals, integrity)
 signature: signature du téléphone sur l’ensemble précédent
```

Les anciens champs se trouvent maintenant sous `payload`. Le SHA-256 `payload.integrity` reste un contrôle de corruption ; seule la signature Ed25519 liée à l’autorisation apporte la vérification d’origine.

L’outil vérifie successivement le format, la signature BLI, l’absence de révocation, la signature du téléphone, la correspondance de l’identité et la présence exacte de cette autorisation dans le registre. Il calcule les comptes à partir des annotations, détecte un fichier déjà contrôlé et propose un rapport téléchargeable. Les réponses elles-mêmes ne sont pas stockées par l’outil local.

Une nouvelle annotation porte `authorizationId`. Une annotation antérieure conserve l’absence de ce champ, même lorsqu’elle est modifiée après activation. Une annotation produite sous une ancienne autorisation conserve sa référence. Le rapport sépare **sous cet accès** et **autres / antérieures**. Il n’attribue pas rétroactivement les anciens travaux à la nouvelle autorisation. Les archives d’un autre collecteur ne sont pas incluses dans l’export du compte ouvert.

La signature atteste l’origine du fichier et l’absence de modifications après signature. Elle ne prouve ni la vérité des réponses, ni leur qualité, ni la présence physique du collecteur déclaré. La campagne est une étiquette approuvée pour l’accès ; elle ne limite pas les identifiants de lots, qui doivent être contrôlés au dépouillement.

## Code oublié, téléphone perdu, révocation

- **Code personnel oublié** : préparer une nouvelle demande avec le même code collecteur. Le coordinateur approuve un remplacement. Le fichier d’activation déjà utilisé ne permet jamais de choisir un nouveau code. Les données déjà présentes restent dans SQLite.
- **Autre téléphone ou réinstallation** : nouvelle demande et nouvelle autorisation. Les clés protégées ne sont pas une sauvegarde des travaux. Les travaux perdus ne peuvent être récupérés que depuis un export existant ; l’import de restauration d’annotations n’est pas inclus dans cette version.
- **Révocation** : inscrire le motif dans le registre. Les futurs contrôles d’exports de cet accès échouent. Le téléphone hors ligne continue à fonctionner jusqu’à intervention : aucune révocation immédiate à distance n’est promise.
- **Mot de passe du coordinateur oublié** : pas de récupération du secret chiffré sans ce mot de passe. Une nouvelle autorité nécessiterait une procédure de rotation et une mise à jour de l’app ; le bouton de création refuse de remplacer silencieusement une clé déjà configurée.

Les autorisations de cette bêta n’ont pas d’expiration automatique. La campagne et le calendrier de collecte restent distincts. Sans référence de temps fiable en ligne, l’heure modifiable du téléphone ne doit pas servir de preuve cryptographique d’expiration.

## Détails de sécurité et limites

- Ed25519 via `@noble/curves`, vérification stricte (`zip215: false`). Génération aléatoire native via `expo-crypto.getRandomValues`, y compris en développement ; pas de repli vers Math.random.
- Sérialisation BLI JSON v1 : clés d’objets triées récursivement, tableaux conservés, encodage JSON des valeurs, préfixe signé `BLI-OFFLINE-V1\n`. Les formats et versions sont signés et les schémas d’activation sont fermés.
- Clés et vérificateurs des codes personnels dans Expo SecureStore. Code dérivé avec PBKDF2-HMAC-SHA256, 600 000 itérations et sel aléatoire par activation. Aucun code en clair, aucune clé privée dans les exports ou dans le stockage SQLite de l’app.
- Après cinq erreurs, délai de 30 secondes puis croissance jusqu’à 15 minutes ; compteur persisté dans SecureStore. Un recul de l’horloge ne raccourcit pas un délai déjà enregistré. Ce mécanisme n’est pas une protection contre un appareil compromis ou une manipulation avancée de son horloge.
- Un compte déjà présent dans SQLite ne crée jamais une session ouverte. La session déverrouillée reste uniquement en mémoire, sans expiration lors d’un passage en arrière-plan. Verrouillage après redémarrage complet de l’app ou déconnexion volontaire ; une vérification de code en cours ne réouvre pas une session verrouillée entre-temps. Si le système arrête l’app en arrière-plan ou si Expo recharge entièrement le projet, le code est à nouveau demandé.
- La vérification du code utilise actuellement PBKDF2 en JavaScript. Elle peut être lente sur téléphone, en particulier en mode développement. Les allers-retours entre applications ne relancent plus ce calcul ; le nombre d’itérations et le format des accès existants restent identiques.
- SecureStore protège les secrets au repos, mais cette version ne prétend pas effectuer les signatures avec une clé matérielle non exportable. Les clés passent en mémoire JavaScript lors de leur utilisation.
- SQLite et les exports de collecte ne sont pas chiffrés par le code personnel. Le verrouillage applicatif et la protection du système ne remplacent pas le chiffrement complet des annotations, qui constituerait un chantier distinct.
- L’ordinateur du coordinateur et les téléphones doivent être de confiance. Un appareil rooté, une app modifiée, un ordinateur compromis ou une restauration volontaire d’un ancien registre ne sont pas rendus inoffensifs par ces signatures.

## Vérifications automatisées

`npm run test:auth` vérifie le protocole avec des clés temporaires : interopérabilité avec Node/OpenSSL, autorisation liée au téléphone, falsification, rejeu, persistance des erreurs de code, concurrence avec le verrouillage, remplacement, révocation, contrôle des exports, doublons et sauvegarde/restauration chiffrée. Il teste aussi les restrictions Host/Origin/jeton de l’interface locale.

`npm run test:beta` vérifie la conservation des annotations anciennes, le maintien de leurs références d’autorisation et la séparation des archives entre collecteurs, ainsi que les 100 photos. `npm run typecheck` et `npx expo export --platform all` vérifient les cibles Web, Android et iOS. Ces contrôles ne remplacent pas un essai sur le téléphone réel.

Références : [Ed25519 / RFC 8032](https://www.rfc-editor.org/rfc/rfc8032.html), [Expo SecureStore SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), [Expo Crypto SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/), [noble-curves](https://github.com/paulmillr/noble-curves).
