import { readFileSync } from 'node:fs';
import { keyIdOf, type TrustStore } from '../src/auth/protocol';
const trust = JSON.parse(readFileSync('src/auth/trusted-issuers.json', 'utf8')) as TrustStore;
if (trust.version !== 1 || !trust.keys.length || trust.keys.some((k) => !/^[a-f0-9]{64}$/.test(k.publicKey) || k.keyId !== keyIdOf(k.publicKey))) {
  console.error('Initialisez l’outil local avec npm run authority avant de construire la bêta. La clé publique BLI doit être intégrée au projet.');
  process.exit(1);
}
console.log(`${trust.keys.length} clé(s) publique(s) BLI configurée(s). Aucune clé privée n’est nécessaire à la construction.`);
