/**
 * Regenere src/data/lexiconEntries.json a partir du CSV du lexique.
 *
 *   npm run build:lexicon
 *
 * L'application ne lit jamais le CSV : le decouper et le normaliser a chaque
 * demarrage serait du travail refait pour rien, et Metro n'embarque pas les
 * fichiers .csv. Le CSV reste la source qu'on modifie a la main ; le JSON en est
 * la forme compacte embarquee. Ce script fait le pont, et il doit etre relance
 * apres chaque modification du CSV.
 *
 * Ajouter une langue : ajouter la colonne dans le CSV (en-tete « Kituba »,
 * « Kikongo »...) et relancer. Aucune modification du moteur n'est necessaire.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = join(root, 'lexicon/dictionnaire_francais_english_lingala.csv');
const jsonPath = join(root, 'src/data/lexiconEntries.json');

/** En-tetes acceptes, ramenes au code de langue utilise par l'application. */
const HEADER_TO_LANGUAGE = {
  francais: 'fr',
  french: 'fr',
  fr: 'fr',
  english: 'en',
  anglais: 'en',
  en: 'en',
  lingala: 'ln',
  ln: 'ln',
  kituba: 'ktu',
  munukutuba: 'ktu',
  ktu: 'ktu',
  kikongo: 'kg',
  kg: 'kg',
  portugais: 'pt',
  portugues: 'pt',
  pt: 'pt',
};

function headerToLanguage(header) {
  const key = header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return HEADER_TO_LANGUAGE[key] ?? null;
}

/**
 * Lecteur CSV conforme a RFC 4180 : champs entre guillemets, guillemets
 * doubles a l'interieur, retours a la ligne dans un champ, CRLF. Ecrit a la
 * main pour ne pas ajouter de dependance a un projet mobile.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let index = 0;

  // Retire le BOM eventuel laisse par un tableur.
  if (text.charCodeAt(0) === 0xfeff) index = 1;

  while (index < text.length) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 2; continue; }
        quoted = false;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }

    if (character === '"') { quoted = true; index += 1; continue; }
    if (character === ',') { row.push(field); field = ''; index += 1; continue; }
    if (character === '\r') { index += 1; continue; }
    if (character === '\n') { row.push(field); rows.push(row); row = []; field = ''; index += 1; continue; }

    field += character;
    index += 1;
  }

  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const raw = parseCsv(readFileSync(csvPath, 'utf8'));
if (raw.length < 2) {
  console.error(`Le CSV ${csvPath} ne contient pas de donnees.`);
  process.exit(1);
}

const headers = raw[0];
const languages = [];
const columns = [];
const ignored = [];

headers.forEach((header, position) => {
  const language = headerToLanguage(header.trim());
  if (!language) { ignored.push(header.trim() || `colonne ${position + 1}`); return; }
  if (languages.includes(language)) { ignored.push(`${header.trim()} (doublon de ${language})`); return; }
  languages.push(language);
  columns.push(position);
});

if (languages.length === 0) {
  console.error('Aucune colonne de langue reconnue dans l’en-tete :', headers.join(', '));
  console.error('En-tetes acceptes :', [...new Set(Object.keys(HEADER_TO_LANGUAGE))].join(', '));
  process.exit(1);
}

const rows = [];
const seen = new Set();
let empty = 0;
let duplicates = 0;

raw.slice(1).forEach((line) => {
  const cells = columns.map((position) => (line[position] ?? '').normalize('NFC').replace(/\s+/g, ' ').trim());
  if (cells.every((cell) => cell === '')) { empty += 1; return; }
  const key = cells.join('');
  if (seen.has(key)) { duplicates += 1; return; }
  seen.add(key);
  rows.push(cells);
});

const payload = {
  schemaVersion: 1,
  source: 'dictionnaire_francais_english_lingala',
  languages,
  rows,
};
writeFileSync(jsonPath, JSON.stringify(payload), 'utf8');

const filled = languages.map((language, position) => {
  const count = rows.filter((cells) => cells[position] !== '').length;
  return `${language} ${count}`;
});

console.log(`Lexique reconstruit depuis ${csvPath.replace(`${root}/`, '')}`);
console.log(`  langues        : ${languages.join(', ')}`);
console.log(`  entrees        : ${rows.length}`);
console.log(`  cellules pleines : ${filled.join(' | ')}`);
if (empty) console.log(`  lignes vides ignorees : ${empty}`);
if (duplicates) console.log(`  doublons exacts ignores : ${duplicates}`);
if (ignored.length) console.log(`  colonnes ignorees : ${ignored.join(', ')}`);
console.log(`  ecrit vers     : ${jsonPath.replace(`${root}/`, '')}`);
