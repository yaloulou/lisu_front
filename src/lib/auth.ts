import { useSyncExternalStore } from 'react'
import { api, TOKEN_KEY } from './api'
import type { User } from './data'

interface Session { user: User | null; loading: boolean }
let state: Session = { user: null, loading: !!localStorage.getItem(TOKEN_KEY) }
const listeners = new Set<() => void>()
function publish(next: Session) { state = next; listeners.forEach(listener => listener()) }
export function logout() { localStorage.removeItem(TOKEN_KEY); publish({ user: null, loading: false }) }
window.addEventListener('intel-session-expired', logout)
window.addEventListener('storage', event => { if (event.key === TOKEN_KEY) { if (!event.newValue) logout(); else void refreshProfile() } })
export async function refreshProfile(): Promise<User | null> {
  const currentToken = localStorage.getItem(TOKEN_KEY)
  if (!currentToken) { publish({ user: null, loading: false }); return null }
  try { const user = await api<User>('/auth/me'); if (localStorage.getItem(TOKEN_KEY) !== currentToken) return null; publish({ user, loading: false }); return user }
  catch (error) { if (localStorage.getItem(TOKEN_KEY) === currentToken) publish({ user: null, loading: false }); throw error }
}
export async function login(email: string, password: string) {
  const response = await api<{ access_token: string }>('/auth/login', { method: 'POST', body: { email: email.trim().toLowerCase(), password } })
  localStorage.setItem(TOKEN_KEY, response.access_token)
  try { return await refreshProfile() } catch (error) { logout(); throw error }
}
export function useSession() { return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener) }, () => state) }
export function startSession() { void refreshProfile().catch(() => undefined) }
