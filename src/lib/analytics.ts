import { get, idOf, rows, string } from './data'
import type { Data, Resource } from './data'
import { configs } from './resources'

export function summarizeIncidents(items: Data[]) {
  const group = (path: string) => items.reduce<Record<string, number>>((groups, item) => { const key = string(get(item, path)) || 'Non renseigné'; groups[key] = (groups[key] || 0) + 1; return groups }, {})
  const sum = (fields: string[]) => items.reduce((total, item) => total + fields.reduce((sum, path) => sum + (Number(get(item, path)) || 0), 0), 0)
  return { incidents: items.length, deaths: sum(['degats_humains.morts_civils', 'degats_humains.morts_allies', 'degats_humains.morts_ennemis']), injured: sum(['degats_humains.blesses_civils', 'degats_humains.blesses_allies', 'degats_humains.blesses_ennemis']), missing: sum(['degats_humains.enleves_disparus']), provinces: group('location.province_region'), natures: group('event.event_type'), days: items.reduce<Record<string, number>>((days, item) => { const day = string(get(item, 'event.date_event')).slice(0, 10); if (day) days[day] = (days[day] || 0) + 1; return days }, {}) }
}
interface Point { id: string; title: string; description: string; lat: number; lon: number; href: string }
export function recordPoints(resource: Resource, items: Data[]): Point[] {
  return items.flatMap(item => {
    const locations = resource === 'entities' ? [get(item, 'attributes.lieu'), ...rows(item.locations)] : [item.location]
    return locations.flatMap((location, index) => {
      const latitude = get(location, 'geo.lat') ?? get(location, 'latitude'), longitude = get(location, 'geo.lon') ?? get(location, 'longitude')
      if (latitude === '' || longitude === '' || latitude == null || longitude == null) return []
      const lat = Number(latitude), lon = Number(longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return []
      const title = string(item.name || item.title || item.summary || get(item, 'event.event_type'))
      return [{ id: `${idOf(item)}-${index}`, title, description: string(get(location, 'address') || get(location, 'province') || get(location, 'province_region')), lat, lon, href: `#${configs[resource].path}/${encodeURIComponent(idOf(item))}` }]
    })
  })
}
