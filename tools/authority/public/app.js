'use strict';
const $ = (selector) => document.querySelector(selector);
const token = $('meta[name="bli-token"]').content;
const languages = { ln: 'Lingala', ktu: 'Kituba', kg: 'Kikongo' };
let state; let request = null; let report = null; let busy = false;
async function api(action, body = {}) {
  const response = await fetch(`/api/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-BLI-Token': token }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'L’opération a échoué.');
  return result;
}
function message(text, error = false) {
  const el = $('#message'); el.textContent = text; el.hidden = !text; el.classList.toggle('error', error);
  if (text) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function download(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function details(selector, fields) {
  const dl = $(selector); dl.replaceChildren();
  for (const [label, value] of fields) {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = String(value);
    dl.append(dt, dd);
  }
}
async function jsonFile(file, limit = 25 * 1024 * 1024) {
  if (!file) throw new Error('Choisissez un fichier.');
  if (file.size > limit) throw new Error('Ce fichier est trop volumineux.');
  try { return JSON.parse(await file.text()); } catch { throw new Error('Le fichier ne contient pas un document JSON lisible.'); }
}
async function action(fn) {
  if (busy) return;
  busy = true; message(''); document.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try { await fn(); await refresh(); }
  catch (e) { message(e.message, true); await refresh().catch(() => {}); }
  finally { busy = false; document.querySelectorAll('button').forEach((b) => { b.disabled = b.dataset.unavailable === 'true'; }); }
}
function cell(row, text, secondary) {
  const td = document.createElement('td'); td.textContent = text;
  if (secondary) { const small = document.createElement('small'); small.textContent = secondary; td.append(small); }
  row.append(td); return td;
}
function renderRegistry() {
  const body = $('#registry'); body.replaceChildren();
  $('#empty-registry').hidden = state.authorizations.length > 0;
  $('#access-count').textContent = `${state.authorizations.length} autorisation(s)`;
  for (const auth of [...state.authorizations].reverse()) {
    const p = auth.payload; const revoked = state.revocations.find((r) => r.authorizationId === p.authorizationId);
    const row = document.createElement('tr');
    cell(row, `${p.identity.firstName} ${p.identity.lastName}`, p.identity.collectorCode);
    cell(row, languages[p.identity.language], p.campaignId);
    cell(row, revoked ? 'Révoqué' : 'Autorisé', revoked ? revoked.reason : new Date(p.issuedAt).toLocaleDateString('fr-FR'));
    const buttons = cell(row, '');
    const save = document.createElement('button'); save.className = 'secondary'; save.textContent = 'Télécharger';
    save.disabled = !!revoked; save.dataset.unavailable = String(!!revoked);
    save.onclick = () => download(auth, `bli-autorisation-${p.identity.collectorCode}-${p.authorizationId.slice(0, 8)}.json`);
    buttons.append(save);
    if (!revoked) {
      const revoke = document.createElement('button'); revoke.className = 'danger'; revoke.textContent = 'Révoquer';
      revoke.onclick = () => {
        const reason = window.prompt(`Motif de révocation pour ${p.identity.collectorCode} ? Les prochains exports seront refusés. Le téléphone hors ligne ne sera pas bloqué à distance.`);
        if (!reason) return;
        void action(async () => { await api('revoke', { authorizationId: p.authorizationId, reason }); message('Accès révoqué dans le registre. Sauvegardez l’outil pour conserver cette décision.'); });
      };
      buttons.append(revoke);
    }
    body.append(row);
  }
}
async function refresh() {
  state = await api('status');
  $('#setup').hidden = state.initialized;
  $('#unlock').hidden = !state.initialized || state.unlocked;
  $('#workspace').hidden = !state.unlocked;
  $('#data-directory').textContent = `Dossier local : ${state.directory}`;
  if (!state.unlocked) {
    request = null; report = null; $('#request-preview').hidden = true; $('#verification').hidden = true;
    $('#registry').replaceChildren(); $('#request-details').replaceChildren(); $('#export-details').replaceChildren();
    return;
  }
  $('#authority-name').textContent = state.label;
  $('#authority-fingerprint').textContent = `Empreinte BLI · ${state.fingerprint}`;
  $('#configured').textContent = state.configured
    ? 'Clé publique intégrée au projet. Après la première configuration, rechargez l’app sur le téléphone. Sauvegardez cet outil avant de distribuer des accès.'
    : 'La clé publique n’est pas encore intégrée au projet. Verrouillez puis déverrouillez l’outil pour la réinstaller.';
  renderRegistry();
}
$('#setup-form').onsubmit = (e) => {
  e.preventDefault(); const form = e.currentTarget; const data = new FormData(form);
  const password = data.get('password'); const confirmation = data.get('confirmation'); form.password.value = ''; form.confirmation.value = '';
  void action(async () => {
    if (password !== confirmation) throw new Error('Les deux mots de passe sont différents.');
    await api('setup', { label: data.get('label'), password }); message('Autorité créée. Sauvegardez l’outil, puis rechargez l’app sur le téléphone pour commencer le test.');
  });
};
$('#unlock-form').onsubmit = (e) => {
  e.preventDefault(); const form = e.currentTarget; const password = form.password.value; form.password.value = '';
  void action(async () => { await api('unlock', { password }); });
};
$('#restore-form').onsubmit = (e) => {
  e.preventDefault(); const form = e.currentTarget; const file = form.backup.files[0]; const password = form.password.value; form.password.value = '';
  void action(async () => { await api('restore', { document: await jsonFile(file), password }); message('Autorité et registre restaurés.'); });
};
$('#lock').onclick = () => void action(async () => { await api('lock'); });
$('#backup').onclick = () => void action(async () => {
  download(await api('backup'), `bli-sauvegarde-autorite-${new Date().toISOString().slice(0, 10)}.json`);
  message('Sauvegarde téléchargée. Conservez-la sur un support sûr avec votre mot de passe conservé séparément.');
});
$('#request-file').onchange = (e) => {
  const file = e.currentTarget.files[0]; request = null; $('#request-preview').hidden = true;
  $('#issue-form').identityChecked.checked = false; $('#issue-form').replacePrevious.checked = false;
  void action(async () => {
    const result = await api('inspect', { document: await jsonFile(file, 16384) }); request = result.request;
    const i = request.payload.identity;
    details('#request-details', [['Collecteur', `${i.firstName} ${i.lastName}`], ['Code', i.collectorCode], ['Pseudo', i.username], ['Langue', languages[i.language]], ['Téléphone', result.fingerprint]]);
    $('#replace-line').hidden = result.existing.length === 0; $('#request-preview').hidden = false;
  });
};
$('#issue-form').onsubmit = (e) => {
  e.preventDefault(); const form = e.currentTarget;
  const body = { document: request, campaignId: form.campaignId.value, identityChecked: form.identityChecked.checked, replacePrevious: form.replacePrevious.checked };
  void action(async () => {
    if (!request) throw new Error('Ouvrez une demande de téléphone.');
    const auth = await api('issue', body);
    download(auth, `bli-autorisation-${auth.payload.identity.collectorCode}-${auth.payload.authorizationId.slice(0, 8)}.json`);
    request = null; $('#request-preview').hidden = true; $('#request-file').value = '';
    message('Autorisation générée. Remettez ce fichier au collecteur pour qu’il l’importe dans l’app, puis sauvegardez l’outil.');
  });
};
$('#export-file').onchange = (e) => {
  const file = e.currentTarget.files[0]; report = null; $('#verification').hidden = true;
  void action(async () => {
    report = await api('verify', { document: await jsonFile(file) });
    details('#export-details', [['Collecteur', `${report.identity.firstName} ${report.identity.lastName}`], ['Code', report.identity.collectorCode], ['Campagne', report.campaignId], ['Sous cet accès', report.current], ['Autres / antérieures', report.previous], ['Total', report.total], ['Réception', report.duplicate ? 'Déjà contrôlé · doublon' : 'Premier contrôle']]);
    $('#export-notice').textContent = report.notice; $('#verification').hidden = false;
  });
};
$('#download-report').onclick = () => { if (report) download(report, `bli-controle-${report.identity.collectorCode}-${report.digest.slice(0, 8)}.json`); };
void refresh().catch((e) => message(e.message, true));
setInterval(() => { if (!busy) void refresh().catch(() => {}); }, 60000);
