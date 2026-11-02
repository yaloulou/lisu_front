import { asData, string } from './data'
import type { Data } from './data'

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
export const TOKEN_KEY = 'intellisearch_react.access_token'
export const token = () => localStorage.getItem(TOKEN_KEY)
export class ApiError extends Error {
  status: number
  constructor(status: number, text: string) { super(text); this.name = 'ApiError'; this.status = status }
}
export function serverMessage(body: unknown, fallback = 'La requête a échoué'): string {
  const data = asData(body)
  const value = data.message || getReason(data.error)
  return Array.isArray(value) ? value.map(string).join(' · ') : string(value) || fallback
}
function getReason(error: unknown): unknown { return asData(error).reason || (typeof error === 'string' ? error : '') }
function failed(status: number, body: unknown): never {
  if (status === 401) window.dispatchEvent(new Event('intel-session-expired'))
  throw new ApiError(status, serverMessage(body, status === 403 ? 'Vous ne disposez pas des droits nécessaires.' : `Erreur du serveur (${status})`))
}
export async function api<T = Data>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal; blob?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const accessToken = token()
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  let response: Response
  try { response = await fetch(API_BASE + path, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal }) }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new Error(`Connexion au serveur impossible. Vérifiez l’adresse du backend et votre connexion réseau.`, { cause: error })
  }
  if (!response.ok) failed(response.status, await response.json().catch(() => ({})))
  if (options.blob) return await response.blob() as T
  if (response.status === 204) return undefined as T
  return await response.json() as T
}
export function upload(path: string, form: FormData, progress?: (value: number) => void): Promise<Data> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', API_BASE + path)
    const accessToken = token()
    if (accessToken) request.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    request.upload.onprogress = event => { if (event.lengthComputable) progress?.(Math.round(event.loaded * 100 / event.total)) }
    request.onerror = () => reject(new Error('Connexion interrompue pendant l’envoi du fichier.'))
    request.onabort = () => reject(new Error('Envoi du fichier annulé.'))
    request.onload = () => {
      let body: unknown
      try { body = JSON.parse(request.responseText) } catch { body = {} }
      if (request.status >= 200 && request.status < 300) resolve(asData(body))
      else { try { failed(request.status, body) } catch (error) { reject(error) } }
    }
    request.send(form)
  })
}
export const recordPath = (resource: string, id?: string): string => `/api/${resource}${id ? '/' + encodeURIComponent(id) : ''}`
export const evidencePath = (id: string, context: string, recordId?: string, file = false): string => `/api/evidence/${encodeURIComponent(id)}${file ? '/file' : ''}?${new URLSearchParams({ context, ...(recordId ? { recordId } : {}) })}`
