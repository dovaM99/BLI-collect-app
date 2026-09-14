import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Authority } from './authority';

const directory = resolve(process.env.BLI_AUTHORITY_DIR ?? join(homedir(), '.bli-collect-authority'));
const trustPath = resolve(process.env.BLI_AUTHORITY_TRUST_PATH ?? 'src/auth/trusted-issuers.json');
const port = Number(process.env.BLI_AUTHORITY_PORT ?? 8741);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port invalide');
const authority = new Authority(directory, trustPath);
const lockPath = join(directory, 'process.lock');
if (existsSync(lockPath)) {
  const pid = Number(readFileSync(lockPath, 'utf8'));
  let running = false;
  if (Number.isSafeInteger(pid) && pid > 0) { try { process.kill(pid, 0); running = true; } catch { /* stale lock */ } }
  if (running) throw new Error('L’outil BLI utilise déjà ce dossier. Fermez l’autre instance avant de continuer.');
  unlinkSync(lockPath);
}
writeFileSync(lockPath, String(process.pid), { flag: 'wx', mode: 0o600 });
const origin = `http://127.0.0.1:${port}`;
const token = randomBytes(32).toString('hex');
const assets = resolve('tools/authority/public');
const messages: Record<string, string> = {
  AUTHORITY_LOCKED: 'Déverrouillez l’outil avec votre mot de passe.', WRONG_PASSWORD: 'Mot de passe incorrect ou sauvegarde altérée.',
  INVALID_PASSWORD: 'Choisissez un mot de passe d’au moins 12 caractères.', PASSWORD_WAIT: 'Patientez 30 secondes avant de réessayer.',
  IDENTITY_CHECK_REQUIRED: 'Confirmez que vous avez vérifié l’identité du collecteur.', REPLACEMENT_REQUIRED: 'Ce code possède déjà un accès. Confirmez son remplacement.',
  REVOKED_AUTHORIZATION: 'Autorisation révoquée : ce fichier est refusé.', UNKNOWN_AUTHORIZATION: 'Cette autorisation ne figure pas dans votre registre local.',
  INVALID_SIGNATURE: 'Signature invalide : le fichier a été modifié ou ne provient pas du détenteur de la clé attendue.',
  UNKNOWN_ISSUER: 'La signature ne provient pas de votre autorité BLI.', INVALID_DOCUMENT: 'Document BLI invalide.',
  UNSIGNED_EXPORT: 'Cet export ne porte pas la signature BLI attendue. Les anciens exports ne sont pas certifiés.',
  INVALID_BACKUP: 'Sauvegarde invalide.', ALREADY_INITIALIZED: 'Cet outil est déjà initialisé. Aucune clé existante n’a été remplacée.',
  RESTORE_REQUIRED: 'L’app possède déjà une clé publique. Restaurez la sauvegarde correspondante pour conserver les accès existants.',
  DIFFERENT_AUTHORITY: 'La sauvegarde appartient à une autre autorité que celle de cette app.',
  EXPORT_IDENTITY_MISMATCH: 'L’identité de l’export ne correspond pas à l’autorisation.', INVALID_LANGUAGE: 'La langue ne correspond pas à l’autorisation.',
  INVALID_CAMPAIGN: 'Indiquez un nom de campagne valide.', REASON_REQUIRED: 'Indiquez le motif de la révocation.',
  DOCUMENT_TOO_LARGE: 'Le fichier dépasse la limite de 25 Mo.', INVALID_LABEL: 'Indiquez un nom pour votre autorité BLI.',
};
function safeToken(value: unknown) {
  return typeof value === 'string' && value.length === token.length && timingSafeEqual(Buffer.from(value), Buffer.from(token));
}
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  const send = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  if (req.headers.host !== `127.0.0.1:${port}`) { send(403, { error: 'Adresse locale refusée.' }); return; }
  try {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && ['/', '/app.js', '/style.css'].includes(path!)) {
      const file = path === '/' ? 'index.html' : path!.slice(1);
      const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'text/css';
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      const content = readFileSync(join(assets, file), 'utf8');
      res.end(file === 'index.html' ? content.replace('__CSRF_TOKEN__', token) : content); return;
    }
    if (req.method !== 'POST' || !path?.startsWith('/api/') || req.headers.origin !== origin || !safeToken(req.headers['x-bli-token'])
      || !req.headers['content-type']?.startsWith('application/json')) { send(403, { error: 'Requête locale refusée.' }); return; }
    let size = 0; const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) throw new Error('DOCUMENT_TOO_LARGE');
      chunks.push(chunk);
    }
    let body: Record<string, any>;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); }
    catch { throw new Error('INVALID_DOCUMENT'); }
    let result: unknown;
    switch (path) {
      case '/api/status': result = authority.status(); break;
      case '/api/setup': result = authority.setup(body.password, body.label); break;
      case '/api/unlock': result = authority.unlock(body.password); break;
      case '/api/lock': authority.lock(); result = authority.status(); break;
      case '/api/inspect': result = authority.inspectRequest(body.document); break;
      case '/api/issue': result = authority.issue(body.document, body.campaignId, body.replacePrevious, body.identityChecked); break;
      case '/api/revoke': result = authority.revoke(body.authorizationId, body.reason); break;
      case '/api/verify': result = authority.verifyExport(body.document); break;
      case '/api/backup': result = authority.backup(); break;
      case '/api/restore': result = authority.restore(body.document, body.password); break;
      default: send(404, { error: 'Action inconnue.' }); return;
    }
    send(200, result);
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    send(400, { code: messages[code] ? code : 'OPERATION_FAILED', error: messages[code] ?? 'L’opération a échoué. Vérifiez le fichier et les droits d’accès au dossier local.' });
  }
});
server.requestTimeout = 30_000; server.headersTimeout = 15_000;
const cleanup = () => { authority.lock(); try { if (readFileSync(lockPath, 'utf8') === String(process.pid)) unlinkSync(lockPath); } catch {} };
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { cleanup(); server.close(); process.exit(0); });
server.on('error', (error) => { cleanup(); console.error('Impossible de démarrer l’outil local :', error.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`Outil BLI prêt : ${origin}\nLes clés privées et le registre restent dans ${directory}`));
