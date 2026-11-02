// Serveur de validation local : données fictives en mémoire, jamais importé par l’application.
const http = require('node:http');
const accounts = [
  { _id: 'preview-admin', email: 'admin@example.test', nom: 'de validation', prenom: 'Compte', role: 'admin', desk: 'cord_intel', actif: true },
  { _id: 'preview-analyst', email: 'analyste@example.test', nom: 'Alpha', prenom: 'Analyste', role: 'analyste', desk: 'desk_est', actif: true },
  { _id: 'preview-officer', email: 'officier@example.test', nom: 'Bravo', prenom: 'Officier', role: 'officier', desk: 'terrain', actif: true },
];
const now = '2026-10-30T10:00:00Z';
const audit = { created_at: now, created_by: 'preview-officer', updated_at: now, updated_by: 'preview-admin' };
const common = { audit, classification: { level: 'INTERNE', compartments: [] }, tags: [], evidence: [] };
const records = {
  observations: [
    { ...common, _id: 'obs-preview-1', _seq_no: 0, _primary_term: 1, obs_type: 'rencontre', summary: 'Rencontre signalée entre deux représentants — exemple fictif', time: { observed_at: now }, location: { province: 'Province de démonstration', address: 'Lieu de test', geo: { lat: -4.32, lon: 15.31 } }, source: { source_type: 'rapport', source_name: 'Source de validation' }, evaluation: { source_reliability: 'B', info_credibility: '2', confidence: 75 }, workflow: { status: 'pending', target_desks: [] }, entity_refs: [{ entity_id: 'ent-preview-1', role: 'subject' }] },
    { ...common, _id: 'obs-preview-2', _seq_no: 0, _primary_term: 1, obs_type: 'déplacement', summary: 'Déplacement observé et validé — exemple fictif', time: { observed_at: now }, location: { province: 'Province de démonstration' }, workflow: { status: 'validated', target_desks: ['desk_est'], validated_by: 'preview-admin', validated_at: now } },
  ],
  entities: [
    { ...common, _id: 'ent-preview-1', id: 'ent-preview-1', name: 'Organisation Alpha — exemple', description: 'Organisation fictive pour le contrôle de l’interface.', entity_type: 'organisation', status: 'actif', risk: { risk_level: 'faible', watchlist: false }, attributes: { organisation: { type_org: 'Association' } }, contacts: [], locations: [] },
    { ...common, _id: 'ent-preview-2', id: 'ent-preview-2', name: 'Lieu Bravo — exemple', entity_type: 'lieu', status: 'actif', risk: { watchlist: true, risk_level: 'modéré' }, attributes: { lieu: { province: 'Province de démonstration', geo: { lat: -2.5, lon: 28.8 } } } },
  ],
  events: [{ ...common, _id: 'event-preview-1', title: 'Événement documenté — exemple fictif', event_type: 'Rencontre', description: 'Renseignement synthétique de validation.', time: { start: now }, location: { province: 'Province de démonstration' }, participants: [{ entity_id: 'ent-preview-1', role: 'participant' }] }],
  links: [{ ...common, _id: 'link-preview-1', from_entity: 'ent-preview-1', to_entity: 'ent-preview-2', link_type: 'implantation', role_from: 'organisation', role_to: 'lieu', evaluation: { confidence: 75 }, time: { start: now } }],
  intel: Array.from({ length: 12 }, (_, index) => ({ ...common, _id: `intel-preview-${index}`, location: { province_region: ['Province Alpha', 'Province Bravo', 'Province Charlie'][index % 3], territoire_ville: 'Ville de démonstration', localite_village_lieuprecis: 'Lieu fictif', latitude: -3 + index / 10, longitude: 25 + index / 10 }, event: { event_type: ['Incident de test', 'Signalement', 'Rencontre'][index % 3], date_event: `2026-10-${String(20 + index % 10).padStart(2, '0')}T10:00:00Z`, description: 'Données fictives de validation — aucune information réelle.' }, actors: [], degats_humains: { morts_civils: index % 2, blesses_civils: index % 3, enleves_disparus: index % 2 } })),
};
function visible(record, user) { return (record.owner_id ?? record.audit?.created_by) === user._id || user.desk === 'cord_intel' || ['analyste', 'conseiller'].includes(user.role) && record.workflow?.status === 'validated' && record.workflow.target_desks.includes(user.desk); }
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, 'http://localhost');
  let body = {}; const chunks = []; for await (const chunk of req) chunks.push(chunk);
  try { if (chunks.length) body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(400, { message: 'JSON invalide' }); }
  const user = accounts.find(user => user._id === (req.headers.authorization || '').replace('Bearer ', ''));
  if (url.pathname === '/auth/login') {
    const account = accounts.find(user => user.email === body.email);
    return account && body.password === 'preview-only' ? send(201, { access_token: account._id }) : send(401, { message: 'Identifiants de validation invalides' });
  }
  if (!user) return send(401, { message: 'Session de validation absente' });
  if (url.pathname === '/auth/me') return send(200, user);
  if (url.pathname === '/api/observations/desks') return send(200, { items: [...new Set(accounts.map(user => user.desk).filter(desk => desk && desk !== 'cord_intel'))], eligible_desks: [...new Set(accounts.filter(user => user.actif && ['analyste', 'conseiller'].includes(user.role)).map(user => user.desk))] });
  if (url.pathname === '/api/intel-dashboard/provinces') return send(200, { items: ['Province Alpha', 'Province Bravo', 'Province Charlie'] });
  if (url.pathname === '/api/intel-dashboard/territoires') return send(200, { items: ['Ville de démonstration'] });
  if (url.pathname === '/api/intel-dashboard/data') return send(200, { items: records.intel.filter(item => !url.searchParams.get('province') || item.location.province_region === url.searchParams.get('province')) });
  if (url.pathname.startsWith('/users')) {
    const id = url.pathname.split('/')[2];
    if (!id && req.method === 'GET') return send(200, accounts);
    if (!id) { const item = { ...body, _id: `preview-user-${accounts.length}`, actif: true }; delete item.password; accounts.push(item); return send(201, item); }
    const item = accounts.find(user => user._id === id); if (!item) return send(404, { message: 'Compte introuvable' });
    if (url.pathname.endsWith('/desactiver')) item.actif = false;
    else if (!url.pathname.endsWith('/password')) Object.assign(item, body);
    return send(200, item);
  }
  const [, , resource, identifier, action] = url.pathname.split('/');
  if (!records[resource]) return send(404, { message: 'Route de validation inconnue' });
  if (identifier === 'search') {
    let items = records[resource];
    if (resource === 'observations') items = items.filter(item => visible(item, user) && (!body.status || item.workflow.status === body.status));
    if (body.query || body.search) items = items.filter(item => JSON.stringify(item).toLowerCase().includes(String(body.query || body.search).toLowerCase()));
    return send(200, { items, count: items.length });
  }
  const item = records[resource].find(item => item._id === decodeURIComponent(identifier || ''));
  if (!identifier && req.method === 'POST') { const added = { ...body, _id: `${resource}-preview-${Date.now()}`, _seq_no: 0, _primary_term: 1 }; if (resource === 'observations') added.workflow = { status: 'pending', target_desks: [] }; records[resource].push(added); return send(201, { id: added._id, item: added }); }
  if (!item) return send(404, { message: 'Enregistrement introuvable' });
  if (resource === 'observations' && !visible(item, user)) return send(403, { message: 'Accès refusé' });
  if (action === 'validation') { if (body._seq_no !== item._seq_no) return send(409, { message: 'Cette information a changé. Rechargez-la.' }); item.workflow = { status: 'validated', target_desks: body.target_desks, validated_at: new Date().toISOString(), validated_by: user._id }; item._seq_no++; }
  else if (req.method === 'PUT') { Object.assign(item, body); if (resource === 'observations') item.workflow = { status: 'pending', target_desks: [] }; item._seq_no = (item._seq_no || 0) + 1; }
  else if (req.method === 'DELETE') records[resource] = records[resource].filter(value => value !== item);
  send(200, item);
});
server.listen(3187, '127.0.0.1', () => console.log('API de validation locale : http://127.0.0.1:3187 — données fictives uniquement.'));
