/**
 * Tests du moteur de lexique (specification §28).
 *
 * Pas de framework : le moteur est compose de fonctions pures, un script Node
 * suffit et se lance partout sans installer quoi que ce soit.
 *
 *   npm run test:lexicon
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.lexicon-test');
const require = createRequire(import.meta.url);

/** Le nettoyage ne doit jamais masquer le resultat des tests. */
function cleanup() {
  try {
    rmSync(outDir, { recursive: true, force: true });
  } catch {
    // Certains montages interdisent la suppression : sans consequence, le
    // dossier est ignore par git.
  }
}

cleanup();
execFileSync(
  'npx',
  [
    'tsc', 'src/services/lexicon/index.ts',
    '--outDir', outDir,
    '--module', 'commonjs', '--target', 'es2020',
    '--skipLibCheck', '--esModuleInterop',
    '--moduleResolution', 'node', '--resolveJsonModule',
  ],
  { cwd: root, stdio: 'inherit' },
);

const lexicon = require(join(outDir, 'index.js'));
const payload = JSON.parse(readFileSync(join(root, 'src/data/lexiconEntries.json'), 'utf8'));
const index = lexicon.buildLexiconIndex(payload);

let failures = 0;
function check(name, condition, detail) {
  if (!condition) failures += 1;
  const status = condition ? '  ok  ' : ' ECHEC';
  console.log(`${status} ${name}${detail === undefined ? '' : `  ->  ${detail}`}`);
}

const forms = (results) => results.map((item) => item.displayForm);
const search = (query, sourceLanguage, limit = 5) =>
  lexicon.lookupLexicon({ query, sourceLanguage, limit }, index);
const normalizedForms = (results) => results.map((item) => lexicon.normalizeLexeme(item.displayForm));

console.log('\n--- normalisation ---');
check('"  MWANA  " donne "mwana"', lexicon.normalizeLexeme('  MWANA  ') === 'mwana');
check('les accents sont conserves', lexicon.normalizeLexeme('École') === 'école');
check('les apostrophes typographiques sont unifiees', lexicon.normalizeLexeme('l’eau') === "l'eau");

console.log('\n--- decoupage des variantes ---');
const equals = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
check('"ndako, nzo" donne deux formes', equals(lexicon.splitVariants('ndako, nzo'), ['ndako', 'nzo']));
check('le point-virgule separe', equals(lexicon.splitVariants('kosala; esaleli'), ['kosala', 'esaleli']));
check('la barre oblique separe', equals(lexicon.splitVariants('notre / nos'), ['notre', 'nos']));
check('"mot-a-mot" reste intact', equals(lexicon.splitVariants('mot-a-mot'), ['mot-a-mot']));
check('"pene-pene" reste intact', equals(lexicon.splitVariants('pene-pene'), ['pene-pene']));
check('"mwana-mobali" reste intact', equals(lexicon.splitVariants('mwana-mobali'), ['mwana-mobali']));
check('"kokende - partir" est separe', equals(lexicon.splitVariants('kokende - partir'), ['kokende', 'partir']));

console.log('\n--- distances ---');
check('insertion', lexicon.damerauLevenshtein('mwana', 'mwana') === 0);
check('suppression', lexicon.damerauLevenshtein('mwna', 'mwana') === 1);
check('inversion adjacente', lexicon.damerauLevenshtein('mnawa', 'mwana') === 2);
check('seuil 1-2 caracteres : aucun fuzzy', lexicon.getMaxDistance(2) === 0);
check('seuil 3-4 caracteres : distance 1', lexicon.getMaxDistance(4) === 1);
check('seuil 5+ caracteres : distance 2', lexicon.getMaxDistance(8) === 2);
check('distance de prefixe indulgente', lexicon.prefixDistance('mwa', 'mwana', 2) === 0);

console.log('\n--- recherche ---');
check('"mwan" propose mwana', normalizedForms(search('mwan', 'ln')).includes('mwana'), forms(search('mwan', 'ln')).join(' | '));
check('"mwna" propose mwana malgre la faute', normalizedForms(search('mwna', 'ln')).includes('mwana'), forms(search('mwna', 'ln')).join(' | '));
check('"m" ne declenche aucun fuzzy', search('m', 'ln').every((item) => item.matchType !== 'fuzzy'));
check('le mot exact arrive en premier', search('ndako', 'ln')[0]?.matchType === 'exact');
check('au plus 5 suggestions', search('ko', 'ln').length <= 5);
const deduped = search('ko', 'ln').map((item) => `${item.language}:${item.normalizedForm}`);
check('aucun doublon', new Set(deduped).size === deduped.length);

console.log('\n--- separation des langues ---');
check(
  'une recherche lingala ne rend pas le mot anglais "house"',
  !normalizedForms(search('house', 'ln')).includes('house'),
);
check('"maison" est trouve en francais', normalizedForms(search('maison', 'fr')).includes('maison'));

console.log('\n--- pas de bruit sur un mot trouve ---');
check('"eau" ne rend que "eau"', equals(forms(search('eau', 'fr')), ['eau']), forms(search('eau', 'fr')).join(' | '));
check(
  '"ndako" rend ses composes, aucun approche',
  search('ndako', 'ln').every((item) => item.matchType !== 'fuzzy'),
  forms(search('ndako', 'ln')).join(' | '),
);
check('"bonjuor" rend bonjour', normalizedForms(search('bonjuor', 'fr')).includes('bonjour'));

console.log('\n--- aucun resultat invente ---');
check('"zzzqxw" ne rend rien en lingala', search('zzzqxw', 'ln').length === 0);
check('une requete vide ne rend rien', search('   ', 'fr').length === 0);

console.log('\n--- langues a venir ---');
check('kituba est declare indisponible', !lexicon.isLexiconLanguageAvailable('ktu', index));
check('kikongo est declare indisponible', !lexicon.isLexiconLanguageAvailable('kg', index));
check(
  'les langues disponibles sont fr, en, ln',
  equals(lexicon.availableLexiconLanguages(index), ['fr', 'en', 'ln']),
);

console.log('\n--- consultation alphabetique ---');
const browse = lexicon.browseLexemes(index, 'fr');
const browseForms = browse.map((item) => lexicon.normalizeLexeme(item.displayForm));
check('chaque forme apparait une seule fois', new Set(browseForms).size === browseForms.length);
check(
  'la liste est triee',
  browse.every((item, position) => position === 0
    || lexicon.browseSortKey(browse[position - 1].normalizedForm) <= lexicon.browseSortKey(item.normalizedForm)),
);
check(
  'les amorces entre parentheses ne sont plus en tete',
  !browse[0].displayForm.startsWith('('),
  browse.slice(0, 4).map((item) => item.displayForm).join(' | '),
);
check('"(sound)" est classe sous la lettre s', lexicon.browseSortKey('(sound)') === 'sound)');
check('"4 hectare)" est classe sous la lettre h', lexicon.browseSortKey('4 hectare)') === 'hectare)');
check('une forme sans lettre garde sa cle', lexicon.browseSortKey('123') === '123');
check(
  'toutes les langues se consultent',
  ['fr', 'en', 'ln'].every((language) => lexicon.browseLexemes(index, language).length > 1500),
);

console.log('\n--- performance ---');
const queries = ['mwna', 'ndaku', 'kosalisi', 'bonjuor', 'kelasy', 'zzzzq'];
const started = Date.now();
for (let round = 0; round < 20; round += 1) {
  queries.forEach((query) => search(query, 'ln'));
}
const perSearch = (Date.now() - started) / (queries.length * 20);
check(`recherche approchee sous 15 ms (${perSearch.toFixed(2)} ms)`, perSearch < 15);

cleanup();
console.log(`\n${failures === 0 ? 'Tous les tests passent.' : `${failures} test(s) en echec.`}`);
process.exit(failures === 0 ? 0 : 1);
