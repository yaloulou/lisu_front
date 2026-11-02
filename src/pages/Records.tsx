import { useCallback, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, API_BASE, recordPath, upload } from '../lib/api'
import { asData, canCreate, canDelete, canEdit, canRead, canReview, dateLabel, get, idOf, list, message, notify, rows, safeFileUrl, string } from '../lib/data'
import type { Data, EvidenceRef, Resource, User } from '../lib/data'
import { configs, normalizeRecord, visibleSections } from '../lib/resources'
import type { Field } from '../lib/resources'
import { useRemote } from '../lib/hooks'
import { navigate } from '../lib/router'
import { Alert, Badge, Confirm, Empty, Icon, Loading, Modal, PageHeader, Spinner } from '../components/ui'
import { ArrayFields, FieldInput } from '../components/Fields'
import { Evidence } from '../components/Evidence'
import { SearchExcerpt } from '../components/SearchExcerpt'
import { CcocLocationFilters } from '../components/CcocLocationFilters'
import type { EvidenceHandle } from '../components/Evidence'

const labels: Record<string, string> = { person: 'Personne', organisation: 'Organisation', lieu: 'Lieu', pending: 'En attente', validated: 'Validée', actif: 'Actif', inactif: 'Inactif' }
const displayValue = (value: unknown): string => typeof value === 'boolean' ? value ? 'Oui' : 'Non' : labels[string(value)] || string(value) || '—'
function EntityName({ id, user }: { id: string; user: User }) {
  const allowed = canRead(user, 'entities')
  const result = useRemote<Data>(useCallback(async (signal: AbortSignal) => id && allowed ? api(`/api/entities/${encodeURIComponent(id)}`, { signal }) : {}, [id, allowed]))
  return allowed && id ? <a href={`#/profile/${encodeURIComponent(id)}`} onClick={event => event.stopPropagation()}>{string(result.value?.name) || id}</a> : <>{id || '—'}</>
}
export function RecordPhoto({ record, large = false }: { record: Data; large?: boolean }) {
  const photoId = string(rows(record.media_refs).find(ref => ref.role === 'profile')?.doc_id)
  const result = useRemote(useCallback(async (signal: AbortSignal) => photoId ? api(`/api/documents/${encodeURIComponent(photoId)}`, { signal }) : {}, [photoId]))
  const url = result.value ? safeFileUrl(get(result.value, 'file.url'), API_BASE) : undefined
  return <span className={`entity-photo ${large ? 'large' : ''}`}>{url ? <img src={url} alt={string(record.name)} /> : <Icon name="entities" size={large ? 32 : 20} />}</span>
}
function Cell({ item, path, user, showSearchExcerpt = false }: { item: Data; path: string; user: User; showSearchExcerpt?: boolean }) {
  const value = get(item, path)
  if (showSearchExcerpt && path === 'event.description' && Array.isArray(item.search_highlights)) {
    const fragments = item.search_highlights.filter((fragment): fragment is string => typeof fragment === 'string')
    if (fragments.length) return <SearchExcerpt fragments={fragments} />
  }
  if (path === 'from_entity' || path === 'to_entity') return <EntityName id={string(value)} user={user} />
  if (/time\.|date_event/.test(path)) return <span className="nowrap">{dateLabel(value)}</span>
  if (path === 'workflow.status') return <Badge tone={value === 'validated' ? 'green' : 'amber'}>{value === 'validated' ? 'Validée' : 'En attente'}</Badge>
  if (path === 'classification.level') return <Badge>{displayValue(value)}</Badge>
  if (path === 'risk.watchlist') return value ? <Badge tone="amber">Surveillée</Badge> : <span className="muted">—</span>
  if (path === 'risk.risk_level') return <Badge tone={['élevé', 'critique'].includes(string(value)) ? 'red' : ''}>{displayValue(value)}</Badge>
  if (path === 'name') return <div className="entity-cell"><RecordPhoto record={item} /><div><strong>{displayValue(value)}</strong><small>{string(item.description).slice(0, 60)}</small></div></div>
  return <span className="cell-text" title={displayValue(value)}>{displayValue(value)}</span>
}
function downloadCsv(resource: Resource, items: Data[]) {
  const columns = configs[resource].columns
  const quote = (value: string) => '"' + (/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"'
  const content = [columns.map(col => quote(col.label)).join(';'), ...items.map(item => columns.map(col => quote(displayValue(get(item, col.path)))).join(';'))].join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a'); link.href = url; link.download = `LISU-${resource}-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function RecordList({ resource, user }: { resource: Resource; user: User }) {
  const config = configs[resource], reviewer = canReview(user)
  const [draft, setDraft] = useState<Data>(resource === 'observations' && reviewer ? { status: 'pending' } : {})
  const [filters, setFilters] = useState(draft), [page, setPage] = useState(1)
  const [deleteRecord, setDeleteRecord] = useState<Data | null>(null), [reviewRecord, setReviewRecord] = useState<Data | null>(null)
  const result = useRemote(useCallback(async (signal: AbortSignal) => list(await api(`${recordPath(resource)}/search`, { method: 'POST', body: { ...filters, size: 500 }, signal })), [resource, filters]))
  const items = result.value?.items || [], perPage = 15, pages = Math.max(1, Math.ceil(items.length / perPage)), currentPage = Math.min(page, pages)
  const title = (item: Data) => string(item.name || item.title || item.summary || get(item, 'event.event_type') || item.link_type)
  async function openReview(item: Data) { try { setReviewRecord(await api(recordPath(resource, idOf(item)))) } catch (error) { notify(message(error), 'error') } }
  const apply = (event: FormEvent) => { event.preventDefault(); setFilters({ ...draft }); setPage(1) }
  const changeFilter = (key: string, value: unknown) => setDraft(previous => ({ ...previous, [key]: value || undefined }))
  async function toggleWatchlist(item: Data) {
    try { await api(recordPath(resource, idOf(item)), { method: 'PUT', body: { ...item, risk: { ...asData(item.risk), watchlist: !get(item, 'risk.watchlist') } } }); notify('Watch List mise à jour.'); result.reload() } catch (error) { notify(message(error), 'error') }
  }
  return <>
    <PageHeader title={config.title} description={config.description} actions={<>{resource === 'intel' && <button className="button secondary" onClick={() => navigate('/board')}><Icon name="chart" />Tableau de bord</button>}{canCreate(user, resource) && <button className="button primary" onClick={() => navigate(resource === 'intel' ? '/dashboard' : `${config.path}/new`)}><Icon name="plus" />{resource === 'intel' ? 'Enregistrer CCOC' : `Nouvelle ${config.singular === 'renseignement' ? 'entrée' : config.singular}`}</button>}</>} />
    {resource === 'observations' && <Alert>{reviewer ? 'Desk cord_intel : examinez les informations en attente, puis validez-les et choisissez leurs desks destinataires.' : 'Vous pouvez consulter vos informations dès leur enregistrement, y compris pendant la validation. Les analystes et conseillers peuvent aussi consulter celles distribuées à leur desk.'}</Alert>}
    <section className="panel"><form className="filters" onSubmit={apply}>
      <label className="search-field"><Icon name="search" /><input aria-label="Rechercher" value={string(draft[resource === 'entities' ? 'query' : 'search'])} onChange={event => changeFilter(resource === 'entities' ? 'query' : 'search', event.target.value)} placeholder={resource === 'intel' ? 'Rechercher dans la description…' : `Rechercher dans les ${config.title.toLowerCase()}…`} /></label>
      {resource === 'observations' && reviewer && <select aria-label="Statut de validation" value={string(draft.status)} onChange={event => changeFilter('status', event.target.value)}><option value="">Tous les statuts</option><option value="pending">En attente</option><option value="validated">Validées</option></select>}
      {resource === 'entities' && <><select aria-label="Type d’entité" value={string(draft.entity_type)} onChange={event => changeFilter('entity_type', event.target.value)}><option value="">Tous les types</option><option value="person">Personnes</option><option value="organisation">Organisations</option><option value="lieu">Lieux</option></select><select aria-label="Watch List" value={draft.watchlist === true ? 'true' : ''} onChange={event => changeFilter('watchlist', event.target.value === 'true' ? true : undefined)}><option value="">Toutes les entités</option><option value="true">Watch List uniquement</option></select></>}
      {resource === 'observations' && <select aria-label="Type d’information" value={string(draft.obs_type)} onChange={event => changeFilter('obs_type', event.target.value)}><option value="">Tous les types</option>{configs.observations.fields[0].fields[0].options?.map(type => <option key={type}>{type}</option>)}</select>}
      {resource === 'events' && <input aria-label="Type de renseignement" placeholder="Type de renseignement" value={string(draft.event_type)} onChange={event => changeFilter('event_type', event.target.value)} />}
      {resource === 'links' && <input aria-label="Type de relation" placeholder="Type de relation" value={string(draft.linkType)} onChange={event => changeFilter('linkType', event.target.value)} />}
      {resource === 'intel' && <CcocLocationFilters province={string(draft.province_region)} territoire={string(draft.territoire_ville)} onProvinceChange={value => setDraft(previous => ({ ...previous, province_region: value || undefined, territoire_ville: undefined }))} onTerritoireChange={value => changeFilter('territoire_ville', value)} />}
      {!['entities', 'links'].includes(resource) && <><label className="date-filter"><span>Du</span><input type="date" aria-label="Date de début" value={string(draft.dateFrom)} onChange={event => changeFilter('dateFrom', event.target.value)} /></label><label className="date-filter"><span>Au</span><input type="date" aria-label="Date de fin" value={string(draft.dateTo).slice(0, 10)} onChange={event => changeFilter('dateTo', event.target.value ? new Date(event.target.value + 'T23:59:59.999').toISOString() : undefined)} /></label></>}
      <button className="button primary" disabled={result.loading}>{result.loading ? <Spinner /> : <Icon name="search" size={17} />}Rechercher</button><button className="button quiet" type="button" onClick={() => { setDraft({}); setFilters({}); setPage(1) }}>Réinitialiser</button>
    </form>
    <div className="table-toolbar"><span><strong>{result.value?.count || 0}</strong> enregistrement{result.value?.count === 1 ? '' : 's'}{result.value && result.value.count > items.length ? ` · ${items.length} chargés, affinez la recherche` : ''}</span><div className="row-actions"><button className="button quiet small" onClick={result.reload} disabled={result.loading}><Icon name="refresh" size={16} />Actualiser</button><button className="button quiet small" onClick={() => downloadCsv(resource, items)} disabled={!items.length || result.loading}><Icon name="download" size={16} />CSV</button></div></div>
    {result.error ? <div className="panel-padding"><Alert error>{result.error}</Alert></div> : result.loading ? <Loading /> : !items.length ? <Empty title={resource === 'observations' && !reviewer ? 'Aucune information à afficher' : 'Aucun enregistrement trouvé'} /> : <div className="table-scroll"><table><thead><tr>{config.columns.map(column => <th key={column.path}>{column.label}</th>)}<th className="actions-column">Actions</th></tr></thead><tbody>{items.slice((currentPage - 1) * perPage, currentPage * perPage).map(item => <tr key={idOf(item)}>{config.columns.map(column => <td key={column.path}><Cell item={item} path={column.path} user={user} showSearchExcerpt={resource === 'intel' && !!string(filters.search).trim()} /></td>)}<td><div className="row-actions">
      <button className="icon-button" aria-label={`Consulter ${title(item)}`} title="Consulter" onClick={() => navigate(`${config.path}/${encodeURIComponent(idOf(item))}`)}><Icon name="eye" size={18} /></button>
      {canEdit(user, resource) && <button className="icon-button" aria-label={`Modifier ${title(item)}`} title="Modifier" onClick={() => navigate(`${config.path}/${encodeURIComponent(idOf(item))}/edit`)}><Icon name="edit" size={18} /></button>}
      {resource === 'observations' && reviewer && <button className="icon-button success-text" title="Valider et distribuer" aria-label={`Valider ${title(item)}`} onClick={() => void openReview(item)}><Icon name="check" size={19} /></button>}
      {resource === 'entities' && canEdit(user, resource) && <button className="icon-button" title="Modifier la Watch List" aria-label="Modifier la Watch List" onClick={() => void toggleWatchlist(item)}><Icon name="shield" size={18} /></button>}
      {canDelete(user, resource) && <button className="icon-button danger-text" title="Supprimer" aria-label={`Supprimer ${title(item)}`} onClick={() => setDeleteRecord(item)}><Icon name="trash" size={18} /></button>}
    </div></td></tr>)}</tbody></table></div>}
    {!!items.length && <footer className="pagination"><span>{(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, items.length)} sur {items.length}</span><div className="row-actions"><button className="button secondary small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Précédent</button><span>{currentPage} / {pages}</span><button className="button secondary small" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Suivant</button></div></footer>}
    </section>
    {deleteRecord && <Confirm title={`Supprimer ${config.singular === 'CCOC' ? 'ce CCOC' : 'cet enregistrement'} ?`} onClose={() => setDeleteRecord(null)} onConfirm={async () => { await api(recordPath(resource, idOf(deleteRecord)), { method: 'DELETE' }); notify('Enregistrement supprimé.'); result.reload() }}><p>La suppression de <strong>{title(deleteRecord)}</strong> est définitive.</p></Confirm>}
    {reviewRecord && <Distribution record={reviewRecord} onClose={() => setReviewRecord(null)} onSuccess={() => { setReviewRecord(null); result.reload() }} />}
  </>
}

export function RecordEditor({ resource, id, user }: { resource: Resource; id?: string; user: User }) {
  const result = useRemote(useCallback(async (signal: AbortSignal) => id ? api(recordPath(resource, id), { signal }) : configs[resource].defaults(), [resource, id]))
  if (result.loading) return <Loading />
  if (result.error) return <Alert error>{result.error}</Alert>
  return <EditorForm resource={resource} initial={result.value || {}} user={user} id={id} />
}
function EditorForm({ resource, initial, user, id }: { resource: Resource; initial: Data; user: User; id?: string }) {
  const config = configs[resource]
  const [data, setData] = useState<Data>(() => structuredClone(initial)), [busy, setBusy] = useState(false), [error, setError] = useState(''), [photo, setPhoto] = useState<File | null>(null)
  const evidence = useRef<EvidenceHandle>(null)
  const [confirmLeave, setConfirmLeave] = useState(false), [dirty, setDirty] = useState(false)
  const change = (next: Data) => { setDirty(true); setData(next) }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return
    setError('')
    let payload: Data
    try { payload = normalizeRecord(resource, data, user) } catch (error) { setError(message(error)); return }
    setBusy(true)
    try {
      if (evidence.current) payload.evidence = await evidence.current.uploadAll(payload.classification)
      if (photo && resource === 'entities') {
        const form = new FormData(); form.append('photo', photo)
        const uploaded = await upload('/api/uploads/entity-photo', form)
        const media = [...rows(payload.media_refs).filter(item => item.role !== 'profile'), asData(uploaded.media_ref)]
        payload.media_refs = media; setData(previous => ({ ...previous, media_refs: media })); setPhoto(null)
      }
      await api(recordPath(resource, id), { method: id ? 'PUT' : 'POST', body: payload })
      setDirty(false)
      notify(resource === 'observations' ? 'Information transmise à cord_intel pour validation.' : 'Enregistrement sauvegardé avec succès.')
      navigate(config.path)
    } catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  return <>
    <PageHeader title={resource === 'intel' && !id ? 'Enregistrer CCOC' : `${id ? 'Modifier' : 'Créer'} ${config.singular === 'CCOC' ? 'un CCOC' : resource === 'events' ? 'un renseignement' : 'une ' + config.singular}`} description="Renseignez les faits, leur contexte et leurs sources. Les champs marqués d’un astérisque sont obligatoires." actions={<button className="button secondary" disabled={busy} onClick={() => dirty ? setConfirmLeave(true) : navigate(config.path)}><Icon name="back" />Retour à la liste</button>} />
    {resource === 'observations' && <Alert>L’enregistrement place cette information en attente de validation par cord_intel. Toute modification d’une information validée annule sa distribution.</Alert>}
    <form onSubmit={save} className="record-form">
      {error && <Alert error>{error}</Alert>}
      <fieldset disabled={busy}>
        {visibleSections(config, data).map((section, index) => <section className="form-section" key={section.title}><div className="section-heading"><h2><span className="section-number">{String(index + 1).padStart(2, '0')}</span>{section.title}</h2></div><div className="form-grid">{section.fields.map(field => <FieldInput field={field} data={data} onChange={change} user={user} key={field.path} />)}</div></section>)}
        {config.collections.map(collection => <ArrayFields definition={collection} data={data} onChange={change} user={user} key={collection.path} disabled={busy} />)}
        {resource === 'entities' && <section className="form-section"><div className="section-heading"><h2>Photo de profil</h2></div><div className="photo-editor"><RecordPhoto record={data} large /><div><label className="button secondary"><Icon name="upload" />Choisir une photo<input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file && (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size)) { setError('Choisissez une image JPG, PNG, GIF ou WebP de 5 Mo maximum.'); event.target.value = ''; return } setPhoto(file || null); setDirty(true) }} /></label><p className="muted">{photo?.name || 'JPG, PNG, GIF ou WebP · 5 Mo maximum'}</p>{rows(data.media_refs).some(item => item.role === 'profile') && <button className="button quiet small" type="button" onClick={() => change({ ...data, media_refs: rows(data.media_refs).filter(item => item.role !== 'profile') })}>Retirer la photo actuelle</button>}</div></div></section>}
        {(resource === 'observations' || resource === 'events') && <Evidence ref={evidence} value={(data.evidence as EvidenceRef[]) || []} context={resource} recordId={id} disabled={busy} onChange={refs => { setDirty(true); setData(previous => ({ ...previous, evidence: refs })) }} />}
      </fieldset>
      <footer className="form-actions"><span className="muted"><Icon name="lock" size={15} />Connexion authentifiée au serveur</span><div className="row-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => dirty ? setConfirmLeave(true) : navigate(config.path)}>Annuler</button><button className="button primary" disabled={busy}>{busy ? <Spinner /> : <Icon name="check" />}{busy ? 'Enregistrement…' : id ? 'Enregistrer les modifications' : 'Enregistrer'}</button></div></footer>
    </form>
    {confirmLeave && <Modal title="Quitter le formulaire ?" onClose={() => setConfirmLeave(false)}><div className="modal-body"><p>Les modifications non enregistrées seront perdues.</p></div><footer className="modal-actions"><button className="button secondary" onClick={() => setConfirmLeave(false)}>Continuer la saisie</button><button className="button primary" onClick={() => navigate(config.path)}>Quitter</button></footer></Modal>}
  </>
}

function DetailValue({ field, record, user }: { field: Field; record: Data; user: User }) {
  const value = get(record, field.path)
  return <div className={field.wide || field.kind === 'textarea' ? 'detail-wide' : ''}><dt>{field.label.replace(' (séparés par des virgules)', '').replace(' (séparées par des virgules)', '')}</dt><dd>{field.kind === 'entity' ? <EntityName id={string(value)} user={user} /> : field.kind === 'date' || field.kind === 'datetime-local' ? dateLabel(value) : displayValue(value)}</dd></div>
}
export function RecordDetail({ resource, id, user }: { resource: Resource; id: string; user: User }) {
  const config = configs[resource]
  const result = useRemote(useCallback((signal: AbortSignal) => api(recordPath(resource, id), { signal }), [resource, id]))
  const [review, setReview] = useState(false)
  if (result.loading) return <Loading />
  if (result.error || !result.value) return <Alert error>{result.error || 'Enregistrement introuvable.'}</Alert>
  const data = result.value
  return <><PageHeader title={string(data.name || data.title || data.summary || get(data, 'event.event_type') || data.link_type)} description={`Fiche ${config.singular} · ${id}`} actions={<><button className="button secondary" onClick={() => navigate(config.path)}><Icon name="back" />Liste</button>{canEdit(user, resource) && <button className="button primary" onClick={() => navigate(`${config.path}/${encodeURIComponent(id)}/edit`)}><Icon name="edit" />Modifier</button>}{resource === 'observations' && canReview(user) && <button className="button primary" onClick={() => setReview(true)}><Icon name="check" />Valider et distribuer</button>}<button className="button secondary" onClick={() => window.print()}>Imprimer</button></>} />
    {resource === 'entities' && <div className="profile-banner"><RecordPhoto record={data} large /><div><h2>{string(data.name)}</h2><p>{displayValue(data.entity_type)} · {displayValue(data.status)}</p></div>{get(data, 'risk.watchlist') ? <Badge tone="amber">Watch List</Badge> : null}</div>}
    {resource === 'observations' && <section className="form-section"><div className="section-heading"><h2>Validation et distribution</h2><Badge tone={get(data, 'workflow.status') === 'validated' ? 'green' : 'amber'}>{get(data, 'workflow.status') === 'validated' ? 'Validée' : 'En attente'}</Badge></div><dl className="details-grid"><div><dt>Desks destinataires</dt><dd>{string(get(data, 'workflow.target_desks')) || 'Aucune distribution'}</dd></div><div><dt>Validée le</dt><dd>{dateLabel(get(data, 'workflow.validated_at'))}</dd></div><div><dt>Validée par</dt><dd>{string(get(data, 'workflow.validated_by')) || '—'}</dd></div></dl></section>}
    {visibleSections(config, data).map(section => <section className="form-section" key={section.title}><h2>{section.title}</h2><dl className="details-grid">{section.fields.map(field => <DetailValue key={field.path} field={field} record={data} user={user} />)}</dl></section>)}
    {config.collections.map(collection => rows(get(data, collection.path)).length ? <section className="form-section" key={collection.path}><h2>{collection.title}</h2>{rows(get(data, collection.path)).map((row, index) => <dl className="details-grid array-detail" key={index}>{collection.fields.map(field => <DetailValue key={field.path} field={field} record={row} user={user} />)}</dl>)}</section> : null)}
    {(resource === 'events' || resource === 'observations') && <Evidence value={(data.evidence as EvidenceRef[]) || []} context={resource} recordId={id} readonly />}
    <section className="form-section"><h2>Traçabilité</h2><dl className="details-grid"><div><dt>Créé par</dt><dd>{string(get(data, 'audit.created_by') || data.owner_id) || 'Non renseigné'}</dd></div><div><dt>Date de création</dt><dd>{dateLabel(get(data, 'audit.created_at'))}</dd></div><div><dt>Dernière modification par</dt><dd>{string(get(data, 'audit.updated_by')) || 'Non renseigné'}</dd></div><div><dt>Dernière modification le</dt><dd>{dateLabel(get(data, 'audit.updated_at'))}</dd></div></dl></section>
    {review && <Distribution record={data} onClose={() => setReview(false)} onSuccess={() => { setReview(false); result.reload() }} />}
  </>
}

export function Distribution({ record, onClose, onSuccess }: { record: Data; onClose: () => void; onSuccess: () => void }) {
  const [targets, setTargets] = useState<string[]>(() => Array.isArray(get(record, 'workflow.target_desks')) ? get(record, 'workflow.target_desks') as string[] : [])
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const desks = useRemote(useCallback((signal: AbortSignal) => api<{ items: string[]; eligible_desks?: string[] }>('/api/observations/desks', { signal }), []))
  const eligible = desks.value?.eligible_desks || desks.value?.items || []
  const selected = targets.filter(desk => eligible.includes(desk))
  async function validate(event: FormEvent) {
    event.preventDefault(); if (!selected.length || busy || desks.loading || desks.error) return
    setBusy(true); setError('')
    try { await api(`${recordPath('observations', idOf(record))}/validation`, { method: 'PUT', body: { target_desks: selected, _seq_no: record._seq_no, _primary_term: record._primary_term } }); notify('Information validée et distribuée.'); onSuccess() }
    catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  return <Modal title="Valider et distribuer l’information" onClose={onClose} busy={busy} large><form onSubmit={validate}><div className="modal-body"><p className="review-summary">{string(record.summary)}</p><Alert>Choisissez les desks destinataires après avoir contrôlé l’information. Leurs analystes et conseillers actifs auront accès à ses pièces jointes.</Alert><Evidence value={(record.evidence as EvidenceRef[]) || []} context="observations" recordId={idOf(record)} readonly disabled={busy} />
    <div className="section-heading"><h3>Desks destinataires</h3><button type="button" className="button quiet small" disabled={busy || desks.loading} onClick={desks.reload}><Icon name="refresh" size={16} />Actualiser les desks</button></div>
    {desks.loading ? <Loading /> : desks.error ? <Alert error>{desks.error}</Alert> : !desks.value?.items.length ? <Alert>Aucun desk affecté à un compte. Ajoutez une affectation dans la gestion des utilisateurs.</Alert> : <div className="desk-grid">{desks.value.items.map(desk => <label key={desk} className={`desk-option ${!eligible.includes(desk) ? 'disabled' : ''}`}><input type="checkbox" checked={selected.includes(desk)} disabled={busy || !eligible.includes(desk)} onChange={event => setTargets(previous => event.target.checked ? [...previous, desk] : previous.filter(value => value !== desk))} /><div><strong>{desk}</strong><small>{eligible.includes(desk) ? 'Destinataires autorisés' : 'Aucun analyste ou conseiller actif'}</small></div></label>)}</div>}
    {error && <Alert error>{error}</Alert>}</div><footer className="modal-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Annuler</button><button className="button primary" disabled={busy || desks.loading || !!desks.error || !selected.length}>{busy ? <Spinner /> : <Icon name="check" />}Valider et distribuer</button></footer></form></Modal>
}
