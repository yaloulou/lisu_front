import { asData, get, rows, set, string } from './data'
import type { Data, Resource, User } from './data'

export interface Field { path: string; label: string; kind?: 'text' | 'textarea' | 'number' | 'date' | 'datetime-local' | 'select' | 'csv' | 'checkbox' | 'entity'; options?: string[]; required?: boolean; min?: number; max?: number; wide?: boolean }
export interface Section { title: string; fields: Field[]; when?: { path: string; value: string } }
export interface Collection { path: string; title: string; fields: Field[]; defaults?: Data }
export interface ResourceConfig { title: string; singular: string; path: string; icon: string; description: string; fields: Section[]; collections: Collection[]; columns: { path: string; label: string }[]; defaults: () => Data }
const field = (path: string, label: string, kind: Field['kind'] = 'text', extra: Partial<Field> = {}): Field => ({ path, label, kind, ...extra })
const select = (path: string, label: string, options: string[], required = false) => field(path, label, 'select', { options, required })
const numeric = (path: string, label: string) => field(path, label, 'number', { min: 0 })
const date = (path: string, label: string, required = false) => field(path, label, 'datetime-local', { required })
const geo = (prefix: string): Field[] => [field(`${prefix}.geo.lat`, 'Latitude', 'number', { min: -90, max: 90 }), field(`${prefix}.geo.lon`, 'Longitude', 'number', { min: -180, max: 180 })]
const classification: Section = { title: 'Classification et indexation', fields: [select('classification.level', 'Classification', ['OUVERT', 'PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SECRET', 'TRES_SECRET']), field('classification.compartments', 'Compartiments (séparés par des virgules)', 'csv'), field('tags', 'Étiquettes (séparées par des virgules)', 'csv')] }
const source: Section = { title: 'Source et collecte', fields: [select('source.source_type', 'Type de source', ['humint', 'sigint', 'osint', 'techint', 'imint', 'rapport', 'interrogatoire', 'surveillance']), field('source.source_name', 'Nom de la source'), field('source.source_ref', 'Référence de la source'), field('source.collector', 'Collecteur'), field('source.unit', 'Unité'), field('source.collection_method', 'Méthode de collecte')] }
const evaluation: Section = { title: 'Évaluation', fields: [select('evaluation.source_reliability', 'Fiabilité de la source', ['A', 'B', 'C', 'D', 'E', 'F']), select('evaluation.info_credibility', 'Crédibilité de l’information', ['1', '2', '3', '4', '5', '6']), field('evaluation.confidence', 'Confiance (%)', 'number', { min: 0, max: 100 })] }
const location: Section = { title: 'Localisation', fields: [field('location.province', 'Province'), field('location.territoire', 'Territoire'), field('location.address', 'Adresse'), field('location.groupement', 'Groupement / quartier'), field('location.secteur', 'Secteur / commune'), ...geo('location')] }
const linkedEntities = (path: string, title: string): Collection => ({ path, title, fields: [field('entity_id', 'Entité', 'entity', { required: true }), field('role', 'Rôle', 'text', { required: true })], defaults: { entity_id: '', role: 'subject' } })
const commonDefaults = () => ({ classification: { level: 'OUVERT', compartments: [] }, tags: [] })
const impacts = ['morts', 'blesses', 'enleves_disparus', 'expulses', 'degat_vehicules', 'degat_batiments', 'degat_infrastructures']
const impactLabels = ['Morts', 'Blessés', 'Enlevés / disparus', 'Expulsés', 'Véhicules endommagés', 'Bâtiments endommagés', 'Infrastructures endommagées']
export const humanDamage = ['morts_civils', 'morts_allies', 'morts_ennemis', 'blesses_civils', 'blesses_allies', 'blesses_ennemis', 'enleves_disparus', 'expulses', 'arrestations_interpellations', 'violences_sexuelles']
const humanLabels = ['Morts civils', 'Morts alliés', 'Morts ennemis', 'Blessés civils', 'Blessés alliés', 'Blessés ennemis', 'Enlevés / disparus', 'Expulsés', 'Arrestations / interpellations', 'Violences sexuelles']
export const configs: Record<Resource, ResourceConfig> = {
  observations: {
    title: 'Informations', singular: 'information', path: '/observations', icon: 'eye', description: 'Collecter, contrôler et distribuer les informations aux desks concernés.',
    fields: [
      { title: 'Information observée', fields: [select('obs_type', 'Type d’information', ['déplacement', 'rencontre', 'communication', 'transaction', 'présence', 'activité_suspecte', 'autre'], true), date('time.observed_at', 'Date de l’observation', true), field('summary', 'Résumé de l’information', 'textarea', { required: true, wide: true }), field('event_ref', 'Référence d’un renseignement associé')] },
      location, source, evaluation, classification,
    ], collections: [linkedEntities('entity_refs', 'Entités liées')],
    columns: [{ path: 'summary', label: 'Information' }, { path: 'obs_type', label: 'Type' }, { path: 'location.province', label: 'Province' }, { path: 'time.observed_at', label: 'Date' }, { path: 'workflow.status', label: 'Statut' }],
    defaults: () => ({ ...commonDefaults(), obs_type: 'autre', summary: '', time: { observed_at: new Date().toISOString() }, evidence: [], entity_refs: [], evaluation: { confidence: 50 } }),
  },
  events: {
    title: 'Renseignements', singular: 'renseignement', path: '/extra/events', icon: 'calendar', description: 'Documenter les événements, leurs participants et leurs conséquences.',
    fields: [
      { title: 'Renseignement', fields: [field('title', 'Titre', 'text', { required: true }), field('event_type', 'Type de renseignement', 'text', { required: true }), date('time.start', 'Début', true), date('time.end', 'Fin'), field('description', 'Description', 'textarea', { wide: true })] }, location,
      { title: 'Impact', fields: [...impacts.map((path, index) => numeric(`impact.${path}`, impactLabels[index])), field('impact.autres_degats', 'Autres dégâts', 'textarea', { wide: true })] }, source, evaluation, classification,
    ], collections: [linkedEntities('participants', 'Participants')],
    columns: [{ path: 'title', label: 'Titre' }, { path: 'description', label: 'Description' }, { path: 'event_type', label: 'Type' }, { path: 'location.province', label: 'Province' }, { path: 'time.start', label: 'Début' }, { path: 'classification.level', label: 'Classification' }],
    defaults: () => ({ ...commonDefaults(), title: '', event_type: '', time: { start: new Date().toISOString() }, evidence: [], participants: [] }),
  },
  entities: {
    title: 'Entités', singular: 'entité', path: '/poldiplo', icon: 'entities', description: 'Retrouver et documenter les personnes, organisations et lieux.',
    fields: [
      { title: 'Identité', fields: [field('name', 'Nom / dénomination', 'text', { required: true }), select('entity_type', 'Type d’entité', ['person', 'organisation', 'lieu'], true), select('status', 'Statut', ['actif', 'inactif', 'archivé']), field('aliases', 'Alias (séparés par des virgules)', 'csv'), field('description', 'Description', 'textarea', { wide: true }), field('labels', 'Labels (séparés par des virgules)', 'csv')] },
      { title: 'Informations personnelles', when: { path: 'entity_type', value: 'person' }, fields: [select('attributes.person.sexe', 'Sexe', ['M', 'F', 'Autre']), field('attributes.person.naissance', 'Date de naissance', 'date'), field('attributes.person.lieu_nais', 'Lieu de naissance'), field('attributes.person.etat_civil', 'État civil'), field('attributes.person.profession', 'Profession'), field('attributes.person.nom_pere', 'Nom du père'), field('attributes.person.nom_mere', 'Nom de la mère')] },
      { title: 'Organisation', when: { path: 'entity_type', value: 'organisation' }, fields: [field('attributes.organisation.type_org', 'Type d’organisation'), field('attributes.organisation.secteur_activite', 'Secteur d’activité'), field('attributes.organisation.pays_enregistrement', 'Pays d’enregistrement'), field('attributes.organisation.date_creation', 'Date de création', 'date'), field('attributes.organisation.parent_entity_id', 'Organisation parente', 'entity')] },
      { title: 'Lieu', when: { path: 'entity_type', value: 'lieu' }, fields: [field('attributes.lieu.type_lieu', 'Type de lieu'), field('attributes.lieu.province', 'Province'), field('attributes.lieu.territoire', 'Territoire'), ...geo('attributes.lieu')] },
      { title: 'Évaluation du risque', fields: [select('risk.risk_level', 'Niveau de risque', ['faible', 'modéré', 'élevé', 'critique']), field('risk.risk_score', 'Score de risque', 'number', { min: 0, max: 100 }), field('risk.watchlist', 'Inscrire sur la Watch List', 'checkbox')] }, classification,
    ], collections: [
      { path: 'identifiers', title: 'Identifiants', fields: [field('id_type', 'Type', 'text', { required: true }), field('id_value', 'Valeur', 'text', { required: true }), field('country', 'Pays')] },
      { path: 'contacts', title: 'Contacts', fields: [select('type', 'Type', ['telephone', 'email', 'reseau_social', 'autre'], true), field('value', 'Coordonnée', 'text', { required: true }), field('valid_from', 'Valide depuis', 'date'), field('valid_to', 'Valide jusqu’au', 'date')] },
      { path: 'locations', title: 'Adresses et localisations', fields: [field('role', 'Rôle de l’adresse'), field('address', 'Adresse'), field('province', 'Province'), field('territoire', 'Territoire'), field('groupement', 'Groupement'), field('secteur', 'Secteur'), ...geo('').map(f => ({ ...f, path: f.path.slice(1) })), field('valid_from', 'Valide depuis', 'date'), field('valid_to', 'Valide jusqu’au', 'date')] },
    ],
    columns: [{ path: 'name', label: 'Nom / dénomination' }, { path: 'entity_type', label: 'Type' }, { path: 'status', label: 'Statut' }, { path: 'risk.risk_level', label: 'Risque' }, { path: 'risk.watchlist', label: 'Watch List' }],
    defaults: () => ({ ...commonDefaults(), name: '', entity_type: 'person', status: 'actif', aliases: [], labels: [], identifiers: [], contacts: [], locations: [], media_refs: [], risk: { watchlist: false } }),
  },
  links: {
    title: 'Relations', singular: 'relation', path: '/extra/links', icon: 'network', description: 'Établir et qualifier les liens entre les entités de votre référentiel.',
    fields: [
      { title: 'Relation entre entités', fields: [field('from_entity', 'Entité de départ', 'entity', { required: true }), field('to_entity', 'Entité d’arrivée', 'entity', { required: true }), field('link_type', 'Type de relation', 'text', { required: true }), field('role_from', 'Rôle au départ'), field('role_to', 'Rôle à l’arrivée'), date('time.start', 'Début de validité'), date('time.end', 'Fin de validité'), field('notes', 'Notes', 'textarea', { wide: true })] }, source, evaluation, classification,
    ], collections: [],
    columns: [{ path: 'from_entity', label: 'Entité de départ' }, { path: 'link_type', label: 'Relation' }, { path: 'to_entity', label: 'Entité d’arrivée' }, { path: 'evaluation.confidence', label: 'Confiance' }, { path: 'time.start', label: 'Depuis' }],
    defaults: () => ({ ...commonDefaults(), from_entity: '', to_entity: '', link_type: '', role_from: 'collaborateur', role_to: 'collaborateur', evaluation: { confidence: 50 } }),
  },
  intel: {
    title: 'CCOC', singular: 'CCOC', path: '/search', icon: 'shield', description: 'Enregistrer et exploiter les incidents et leurs bilans.',
    fields: [
      { title: 'Contexte géographique', fields: [field('location.province_region', 'Province / région', 'text', { required: true }), field('location.territoire_ville', 'Territoire / ville', 'text', { required: true }), field('location.secteur_chefferie_commune', 'Secteur / chefferie / commune'), field('location.groupement_quartier', 'Groupement / quartier'), field('location.localite_village_lieuprecis', 'Localité / village / lieu précis', 'text', { required: true }), field('location.pays', 'Pays'), field('location.latitude', 'Latitude', 'number', { min: -90, max: 90 }), field('location.longitude', 'Longitude', 'number', { min: -180, max: 180 }), field('location.geoprecision', 'Précision géographique')] },
      { title: 'Incident', fields: [date('event.date_event', 'Date de l’incident', true), field('event.event_type', 'Nature de l’incident', 'text', { required: true }), field('event.categorie', 'Catégorie'), field('event.description', 'Description des faits', 'textarea', { required: true, wide: true }), field('source.source_name', 'Source'), field('source.source_type', 'Type de source'), field('source.source_ref', 'Référence de la source')] },
      { title: 'Bilan humain', fields: humanDamage.map((key, index) => numeric(`degats_humains.${key}`, humanLabels[index])) },
      { title: 'Bilan matériel', fields: [numeric('degats_materiels.degat_vehicules', 'Véhicules endommagés'), numeric('degats_materiels.degat_batiments', 'Bâtiments endommagés'), numeric('degats_materiels.degat_infrastructures', 'Infrastructures endommagées'), field('degats_materiels.autres_degats', 'Autres dégâts', 'textarea'), field('degats_materiels.autres_bilans', 'Autres bilans', 'textarea')] }, classification,
    ], collections: [{ path: 'actors', title: 'Acteurs impliqués', fields: [field('nom', 'Nom de l’acteur', 'text', { required: true }), field('role', 'Rôle'), field('assoc', 'Association / affiliation')] }],
    columns: [{ path: 'event.event_type', label: 'Nature' }, { path: 'location.province_region', label: 'Province' }, { path: 'location.territoire_ville', label: 'Territoire / ville' }, { path: 'event.date_event', label: 'Date' }, { path: 'event.description', label: 'Description' }],
    defaults: () => ({ ...commonDefaults(), location: { pays: 'République Démocratique du Congo' }, event: { date_event: new Date().toISOString() }, actors: [] }),
  },
}
export const visibleSections = (config: ResourceConfig, data: Data): Section[] => config.fields.filter(section => !section.when || get(data, section.when.path) === section.when.value)
export function normalizeFields(data: Data, fields: Field[]): Data {
  let result = { ...data }
  for (const field of fields) {
    const current = get(result, field.path)
    if (field.required && !string(current).trim()) throw new Error(`Le champ « ${field.label} » est obligatoire.`)
    if (field.kind === 'number' && current !== undefined && current !== null && current !== '') {
      const value = Number(current)
      if (!Number.isFinite(value) || field.min !== undefined && value < field.min || field.max !== undefined && value > field.max) throw new Error(`La valeur de « ${field.label} » est invalide.`)
      result = set(result, field.path, value)
    } else if ((field.kind === 'date' || field.kind === 'datetime-local') && current) {
      const date = new Date(string(current))
      if (Number.isNaN(date.getTime())) throw new Error(`La date « ${field.label} » est invalide.`)
      result = set(result, field.path, date.toISOString())
    } else if (field.kind === 'csv' && typeof current === 'string') result = set(result, field.path, current.split(',').map(value => value.trim()).filter(Boolean))
  }
  for (const field of fields.filter(field => field.path.endsWith('.geo.lat') || field.path === 'geo.lat')) {
    const prefix = field.path.slice(0, -4)
    const lat = get(result, `${prefix}.lat`), lon = get(result, `${prefix}.lon`)
    const missing = (value: unknown) => value === '' || value === undefined || value === null
    if (missing(lat) !== missing(lon)) throw new Error('Renseignez ensemble la latitude et la longitude.')
    if (missing(lat) && missing(lon)) result = set(result, prefix, undefined)
  }
  return result
}
export function normalizeRecord(resource: Resource, data: Data, user: User): Data {
  const config = configs[resource]
  let result = normalizeFields(data, visibleSections(config, data).flatMap(section => section.fields))
  for (const collection of config.collections) result = set(result, collection.path, rows(get(data, collection.path)).map(row => normalizeFields(row, collection.fields)))
  const start = get(result, 'time.start'), end = get(result, 'time.end')
  if (start && end && new Date(string(end)) < new Date(string(start))) throw new Error('La date de fin doit être postérieure ou égale à la date de début.')
  if (resource === 'entities') {
    const type = string(result.entity_type)
    result.attributes = { [type]: asData(asData(result.attributes)[type]) }
  }
  if (resource === 'intel') {
    const lat = get(result, 'location.latitude'), lon = get(result, 'location.longitude')
    const absent = (value: unknown) => value === '' || value === null || value === undefined
    if (absent(lat) !== absent(lon)) throw new Error('Renseignez ensemble la latitude et la longitude.')
  }
  if (resource === 'observations') result = set(result, 'time.reported_at', new Date().toISOString())
  const now = new Date().toISOString()
  result.audit = { ...asData(data.audit), ...(!data._id && !data.id ? { created_at: now, created_by: user._id } : {}), updated_at: now, updated_by: user._id }
  return result
}
