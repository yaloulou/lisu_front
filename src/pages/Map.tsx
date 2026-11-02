import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../lib/api'
import { canRead, list } from '../lib/data'
import type { Resource, User } from '../lib/data'
import { useRemote } from '../lib/hooks'
import { configs } from '../lib/resources'
import { recordPoints } from '../lib/analytics'
import { Alert, Badge, Icon, Loading, PageHeader } from '../components/ui'

export function MapPage({ user, initialSource }: { user: User; initialSource?: string }) {
  const sources: Resource[] = (['entities', 'observations', 'events', 'intel'] as Resource[]).filter(resource => canRead(user, resource))
  const [source, setSource] = useState<Resource>(() => sources.includes(initialSource as Resource) ? initialSource as Resource : sources[0])
  const [tileError, setTileError] = useState(false)
  const result = useRemote(useCallback(async (signal: AbortSignal) => list(await api(`/api/${source}/search`, { method: 'POST', body: { size: 500 }, signal })), [source]))
  const points = useMemo(() => recordPoints(source, result.value?.items || []), [source, result.value])
  const root = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), layer = useRef<L.LayerGroup | null>(null)
  useEffect(() => {
    if (!root.current) return
    const instance = L.map(root.current).setView([-2.5, 23.5], 5)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).on('tileerror', () => setTileError(true)).addTo(instance)
    const markers = L.layerGroup().addTo(instance)
    map.current = instance; layer.current = markers
    return () => { instance.remove(); map.current = null; layer.current = null }
  }, [])
  useEffect(() => {
    if (!map.current || !layer.current) return
    layer.current.clearLayers()
    for (const point of points) {
      const popup = document.createElement('div'), title = document.createElement('strong'), description = document.createElement('p'), link = document.createElement('a')
      title.textContent = point.title; description.textContent = point.description; link.textContent = 'Consulter la fiche →'; link.href = point.href; popup.append(title, description, link)
      L.circleMarker([point.lat, point.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#262626', fillOpacity: 0.9 }).bindPopup(popup).addTo(layer.current)
    }
    if (points.length) map.current.fitBounds(L.latLngBounds(points.map(point => [point.lat, point.lon] as L.LatLngTuple)), { padding: [45, 45], maxZoom: 12 })
  }, [points])
  return <><PageHeader title="Cartographie" description="Situer les informations et les entités disposant de coordonnées géographiques." actions={<button className="button secondary" onClick={result.reload} disabled={result.loading}><Icon name="refresh" />Actualiser</button>} />
    <section className="panel"><div className="table-toolbar"><div className="row-actions"><label htmlFor="map-source">Afficher</label><select id="map-source" value={source} onChange={event => setSource(event.target.value as Resource)}>{sources.map(resource => <option key={resource} value={resource}>{configs[resource].title}</option>)}</select></div><Badge>{points.length} point{points.length > 1 ? 's' : ''} localisé{points.length > 1 ? 's' : ''}</Badge></div>{result.error && <div className="panel-padding"><Alert error>{result.error}</Alert></div>}{tileError && <div className="panel-padding"><Alert>Le fond de carte nécessite une connexion à OpenStreetMap. Les coordonnées restent consultables ci-dessous.</Alert></div>}<div className="map-container" ref={root} aria-label="Carte des enregistrements" />{result.loading ? <Loading /> : <div className="map-caption"><Icon name="info" size={16} /><span>{result.value?.items.length || 0} enregistrement(s) chargé(s). Seuls ceux avec des coordonnées valides sont représentés.</span></div>}</section>
    {!!points.length && <section className="panel"><div className="table-toolbar"><h2>Points localisés</h2></div><div className="table-scroll"><table><thead><tr><th>Enregistrement</th><th>Localisation</th><th>Coordonnées</th><th>Fiche</th></tr></thead><tbody>{points.map(point => <tr key={point.id}><td><strong>{point.title}</strong></td><td>{point.description || '—'}</td><td>{point.lat.toFixed(5)}, {point.lon.toFixed(5)}</td><td><a href={point.href}>Consulter →</a></td></tr>)}</tbody></table></div></section>}
  </>
}
