export type Data = Record<string, unknown>
export type Role = 'officier' | 'analyste' | 'conseiller' | 'coordinateur' | 'admin'
export interface User { _id: string; email: string; role: Role; desk?: string; nom?: string; prenom?: string; actif: boolean }
export interface EvidenceRef { doc_id: string; type?: string; sha256?: string }
export type Resource = 'observations' | 'events' | 'entities' | 'links' | 'intel'
export const roles: Role[] = ['officier', 'analyste', 'conseiller', 'coordinateur', 'admin']
export const asData = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {}
export const rows = (value: unknown): Data[] => Array.isArray(value) ? value.map(asData) : []
export const string = (value: unknown): string => value == null ? '' : Array.isArray(value) ? value.map(string).join(', ') : typeof value === 'object' ? '' : String(value)
export const get = (value: unknown, path: string): unknown => path.split('.').reduce<unknown>((current, key) => asData(current)[key], value)
export function set(data: Data, path: string, value: unknown): Data {
  const [key, ...rest] = path.split('.')
  return { ...data, [key]: rest.length ? set(asData(data[key]), rest.join('.'), value) : value }
}
export const idOf = (data: Data): string => string(data._id || data.id)
export function list(result: unknown): { items: Data[]; count: number } {
  const data = asData(result)
  const items = rows(Array.isArray(result) ? result : data.items || data.hits || data.incidents)
  return { items, count: Number(data.count ?? data.total ?? items.length) || 0 }
}
export const dateLabel = (value: unknown): string => {
  if (!value) return '—'
  const date = new Date(string(value))
  return Number.isNaN(date.getTime()) ? string(value) : new Intl.DateTimeFormat('fr-CD', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
export const message = (error: unknown): string => error instanceof Error ? error.message : 'Une erreur est survenue. Veuillez réessayer.'
export const deskOf = (user: User | null): string => user?.desk?.trim().toLowerCase() || ''
export const canCcoc = (user: User | null): boolean => !!user && (user.role === 'admin' || user.role === 'analyste' && deskOf(user) === 'ccoc')
export const canReview = (user: User | null): boolean => !!user && deskOf(user) === 'cord_intel'
export function canRead(user: User | null, resource: Resource): boolean {
  if (!user) return false
  if (resource === 'intel') return canCcoc(user)
  return resource === 'observations' || user.role !== 'officier'
}
export function canCreate(user: User | null, resource: Resource): boolean {
  if (!user) return false
  if (resource === 'intel') return canCcoc(user)
  if (resource === 'observations') return canReview(user) || ['officier', 'coordinateur', 'admin'].includes(user.role)
  return user.role !== 'officier'
}
export const canEdit = (user: User | null, resource: Resource): boolean => resource === 'observations' ? canReview(user) : canCreate(user, resource)
export function canDelete(user: User | null, resource: Resource): boolean {
  if (!user) return false
  if (resource === 'observations') return canReview(user)
  if (resource === 'entities' || resource === 'intel') return user.role === 'admin'
  return ['coordinateur', 'admin'].includes(user.role)
}
export function notify(text: string, kind: 'success' | 'error' | 'info' = 'success') {
  window.dispatchEvent(new CustomEvent('intel-notification', { detail: { text, kind } }))
}
export function safeFileUrl(value: unknown, base: string): string | undefined {
  try { const url = new URL(string(value), base); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}
