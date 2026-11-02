import { useCallback, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../lib/api'
import { dateLabel, get, idOf, list, string } from '../lib/data'
import { summarizeIncidents } from '../lib/analytics'
import type { Data } from '../lib/data'
import { useRemote } from '../lib/hooks'
import { navigate } from '../lib/router'
import { Alert, Badge, Empty, Icon, Loading, PageHeader } from '../components/ui'

function BarChart({ title, data, color = 'teal' }: { title: string; data: Record<string, number>; color?: string }) {
  const items = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8), max = Math.max(1, ...items.map(item => item[1]))
  return <section className="panel chart-panel"><div className="section-heading"><h2>{title}</h2><Icon name="chart" /></div>{!items.length ? <Empty title="Aucune donnée" /> : <div className="bar-chart">{items.map(([key, value]) => <div className="bar-row" key={key}><div><span title={key}>{key}</span><strong>{value}</strong></div><div className="bar-track"><span className={color} style={{ width: `${value / max * 100}%` }} /></div></div>)}</div>}</section>
}
export function Dashboard() {
  const [draft, setDraft] = useState({ province: '', territoire: '', dateFrom: '', dateTo: '' }), [filters, setFilters] = useState(draft)
  const provinces = useRemote(useCallback((signal: AbortSignal) => api('/api/intel-dashboard/provinces', { signal }), []))
  const territories = useRemote(useCallback((signal: AbortSignal) => draft.province ? api(`/api/intel-dashboard/territoires?${new URLSearchParams({ province: draft.province })}`, { signal }) : Promise.resolve({ items: [] }), [draft.province]))
  const records = useRemote(useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)))
    return list(await api(`/api/intel-dashboard/data?${params}`, { signal }))
  }, [filters]))
  const stats = useMemo(() => summarizeIncidents(records.value?.items || []), [records.value])
  const provinceOptions = (provinces.value?.items || provinces.value?.provinces || []) as string[]
  const territoryOptions = (territories.value?.items || ('territoires' in (territories.value || {}) ? (territories.value as Data).territoires : []) || []) as string[]
  const apply = (event: FormEvent) => { event.preventDefault(); setFilters({ ...draft }) }
  const latest = [...(records.value?.items || [])].sort((a, b) => string(get(b, 'event.date_event')).localeCompare(string(get(a, 'event.date_event')))).slice(0, 8)
  return <><PageHeader title="Tableau de bord CCOC" description="Une vue d’ensemble des incidents, de leur répartition et de leurs bilans." actions={<><button className="button secondary" onClick={() => navigate('/mapdiplo?source=intel')}><Icon name="map" />Voir la carte</button><button className="button primary" onClick={() => navigate('/dashboard')}><Icon name="plus" />Enregistrer CCOC</button></>} />
    <section className="panel"><form className="filters" onSubmit={apply}><select aria-label="Province" value={draft.province} onChange={event => setDraft({ ...draft, province: event.target.value, territoire: '' })}><option value="">Toutes les provinces</option>{provinceOptions.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Territoire" disabled={!draft.province} value={draft.territoire} onChange={event => setDraft({ ...draft, territoire: event.target.value })}><option value="">Tous les territoires</option>{territoryOptions.map(value => <option key={value}>{value}</option>)}</select><label className="date-filter"><span>Du</span><input type="date" aria-label="Date de début" value={draft.dateFrom} onChange={event => setDraft({ ...draft, dateFrom: event.target.value })} /></label><label className="date-filter"><span>Au</span><input type="date" aria-label="Date de fin" value={draft.dateTo} onChange={event => setDraft({ ...draft, dateTo: event.target.value })} /></label><button className="button primary" disabled={records.loading}><Icon name="search" size={17} />Appliquer</button><button type="button" className="button quiet" onClick={records.reload} disabled={records.loading}><Icon name="refresh" size={17} />Actualiser</button></form></section>
    {records.error ? <Alert error>{records.error}</Alert> : records.loading ? <Loading /> : <><div className="stat-grid">{[['Incidents recensés', stats.incidents, 'shield', 'teal'], ['Décès recensés', stats.deaths, 'entities', 'red'], ['Personnes blessées', stats.injured, 'entities', 'amber'], ['Enlevés / disparus', stats.missing, 'search', 'blue']].map(([label, value, icon, tone]) => <article className="stat-card" key={String(label)}><div><span>{label}</span><strong>{Number(value).toLocaleString('fr-FR')}</strong><small>Sur la période sélectionnée</small></div><span className={`stat-icon ${tone}`}><Icon name={String(icon)} size={23} /></span></article>)}</div>
    <div className="dashboard-grid"><BarChart title="Incidents par province" data={stats.provinces} /><BarChart title="Nature des incidents" data={stats.natures} color="blue" /></div>
    <section className="panel chart-panel"><div className="section-heading"><h2>Évolution des incidents</h2><span className="muted">Par jour</span></div>{Object.keys(stats.days).length ? <div className="time-chart" role="img" aria-label="Nombre d’incidents par jour">{Object.entries(stats.days).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([day, count]) => <div className="time-bar" key={day} title={`${day} : ${count} incident(s)`}><strong>{count}</strong><span style={{ height: `${Math.max(5, count / Math.max(...Object.values(stats.days)) * 145)}px` }} /><small>{day.slice(5)}</small></div>)}</div> : <Empty title="Aucune donnée temporelle" />}</section>
    <section className="panel"><div className="table-toolbar"><h2>Derniers incidents</h2><button className="button quiet small" onClick={() => navigate('/search')}>Tous les CCOC<Icon name="arrow" size={16} /></button></div>{!latest.length ? <Empty /> : <div className="table-scroll"><table><thead><tr><th>Incident</th><th>Province</th><th>Date</th><th>Action</th></tr></thead><tbody>{latest.map(item => <tr key={idOf(item)}><td><strong>{string(get(item, 'event.event_type'))}</strong><p className="cell-description">{string(get(item, 'event.description')).slice(0, 100)}</p></td><td><Badge>{string(get(item, 'location.province_region'))}</Badge></td><td>{dateLabel(get(item, 'event.date_event'))}</td><td><button className="icon-button" aria-label="Consulter l’incident" onClick={() => navigate(`/incident/${encodeURIComponent(idOf(item))}`)}><Icon name="eye" /></button></td></tr>)}</tbody></table></div>}</section></>}
  </>
}
