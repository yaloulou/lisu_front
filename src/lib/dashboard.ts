import type { Data } from './data'

export interface DashboardFilters {
  province: string
  territoire: string
  dateFrom: string
  dateTo: string
}
export interface Breakdown {
  name: string
  incidents: number
}
export interface DashboardSummary {
  period: {
    from: string
    to: string
    previous_from: string
    previous_to: string
    days: number
    interval: 'day' | 'week' | 'month'
    time_zone: string
    includes_today: boolean
  }
  generated_at: string
  totals: Record<string, number>
  previous: Record<string, number>
  provinces: Breakdown[]
  territories: Array<
    Breakdown & { province: string; civilian_deaths: number; missing: number }
  >
  natures: Array<Breakdown & { previous: number }>
  actors: Breakdown[]
  timeline: Array<{ date: string; incidents: number }>
  quality: {
    without_province: number
    without_territory: number
    without_actor: number
    without_coordinates: number
    latest_update: string | null
    breakdowns_approximate: boolean
    actors_truncated: boolean
  }
  latest: Data[]
  significant: Data[]
}
export const calendarDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(`${value}T00:00:00Z`))
    : 'Date non renseignée'
export function eventDay(value: string): string {
  if (!value.includes('T')) return calendarDay(value)
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? calendarDay(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Africa/Kinshasa',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(date),
      )
    : 'Date non renseignée'
}
export function dashboardDefaults(
  days = 30,
  now = new Date(),
): DashboardFilters {
  const dateTo = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kinshasa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return {
    province: '',
    territoire: '',
    dateFrom: new Date(Date.parse(dateTo) - (days - 1) * 86400000)
      .toISOString()
      .slice(0, 10),
    dateTo,
  }
}
export function comparison(current: number, previous: number) {
  const difference = current - previous
  const percent = previous > 0 ? (difference / previous) * 100 : null
  return {
    difference,
    percent,
    label:
      percent === null
        ? current
          ? 'Sans base de comparaison'
          : 'Stable'
        : `${percent > 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(percent)} %`,
  }
}
export function dashboardSearch(
  filters: DashboardFilters,
  overrides: Record<string, string | undefined> = {},
) {
  const values = {
    province_region: filters.province,
    territoire_ville: filters.territoire,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    ...overrides,
  }
  return `/search?${new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => !!entry[1]))}`
}
export function initialIntelFilters(query: string): Data {
  const params = new URLSearchParams(query),
    result: Data = {}
  for (const key of [
    'search',
    'province_region',
    'territoire_ville',
    'dateFrom',
    'dateTo',
    'event',
    'actor',
    'impact',
  ]) {
    const value = params.get(key)?.trim()
    if (value) result[key] = value
  }
  return result
}
