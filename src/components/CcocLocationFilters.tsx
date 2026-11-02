import { useCallback } from 'react'
import { api } from '../lib/api'
import { useRemote } from '../lib/hooks'
import { Alert } from './ui'

function options(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && !!item.trim()))].sort((a, b) => a.localeCompare(b, 'fr')) : []
}

interface Props {
  province: string
  territoire: string
  onProvinceChange: (value: string) => void
  onTerritoireChange: (value: string) => void
}

export function CcocLocationFilters({ province, territoire, onProvinceChange, onTerritoireChange }: Props) {
  const provinces = useRemote(useCallback(async (signal: AbortSignal) => options((await api('/api/intel-dashboard/provinces', { signal })).items), []))
  const territories = useRemote(useCallback(async (signal: AbortSignal) => ({
    province,
    items: province ? options((await api(`/api/intel-dashboard/territoires?${new URLSearchParams({ province })}`, { signal })).items) : [],
  }), [province]))
  // useRemote retains the previous response while loading. Never offer the
  // previous province's territories, even before the new request starts.
  const territoryOptions = territories.value?.province === province ? territories.value.items : []
  const territoriesPending = !!province && !territories.error && (territories.loading || territories.value?.province !== province)

  return <>
    <select aria-label="Province" aria-busy={provinces.loading} disabled={provinces.loading || !!provinces.error} value={province} onChange={event => onProvinceChange(event.target.value)}>
      <option value="">{provinces.loading ? 'Chargement des provinces…' : provinces.error ? 'Provinces indisponibles' : provinces.value?.length ? 'Toutes les provinces' : 'Aucune province disponible'}</option>
      {provinces.value?.map(value => <option value={value} key={value}>{value}</option>)}
    </select>
    <select aria-label="Territoire" aria-busy={territoriesPending} disabled={!province || territoriesPending || !!territories.error} value={territoire} onChange={event => onTerritoireChange(event.target.value)}>
      <option value="">{!province ? 'Choisir une province d’abord' : territories.error ? 'Territoires indisponibles' : territoriesPending ? 'Chargement des territoires…' : territoryOptions.length ? 'Tous les territoires / villes' : 'Aucun territoire disponible'}</option>
      {territoryOptions.map(value => <option value={value} key={value}>{value}</option>)}
    </select>
    {provinces.error && <div className="filter-feedback"><Alert error>Impossible de charger les provinces. <button className="button quiet small" type="button" onClick={provinces.reload}>Réessayer les provinces</button></Alert></div>}
    {province && territories.error && <div className="filter-feedback"><Alert error>Impossible de charger les territoires de cette province. <button className="button quiet small" type="button" onClick={territories.reload}>Réessayer les territoires</button></Alert></div>}
  </>
}
