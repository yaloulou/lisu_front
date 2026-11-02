import { useSyncExternalStore } from 'react'
export const navigate = (path: string) => { window.location.hash = path; window.scrollTo({ top: 0 }) }
function subscribe(listener: () => void) { window.addEventListener('hashchange', listener); return () => window.removeEventListener('hashchange', listener) }
export function useRoute() { return useSyncExternalStore(subscribe, () => window.location.hash.slice(1) || '/') }
