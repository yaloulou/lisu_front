import { afterEach, expect, it, vi } from 'vitest'
import { api, API_BASE, evidencePath, serverMessage, TOKEN_KEY } from '../src/lib/api'

afterEach(() => vi.unstubAllGlobals())
it('transmet le jeton React sans utiliser celui de l’ancien frontend', async () => {
  localStorage.setItem('access_token', 'vue-token')
  localStorage.setItem(TOKEN_KEY, 'react-token')
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }))
  vi.stubGlobal('fetch', request)
  await api('/api/observations/search', { method: 'POST', body: { status: 'pending' } })
  expect(request).toHaveBeenCalledWith(API_BASE + '/api/observations/search', expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer react-token', 'Content-Type': 'application/json' }, body: '{"status":"pending"}' }))
})
it('affiche la cause renvoyée par Elasticsearch et distingue une session expirée', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: 'mapping strict workflow' }), { status: 400 })).mockResolvedValueOnce(new Response('{}', { status: 401 })))
  await expect(api('/api/observations')).rejects.toThrow('mapping strict workflow')
  const expired = vi.fn(); window.addEventListener('intel-session-expired', expired)
  await expect(api('/auth/me')).rejects.toMatchObject({ status: 401 })
  expect(expired).toHaveBeenCalledOnce(); window.removeEventListener('intel-session-expired', expired)
  expect(serverMessage({ error: { reason: 'champ inconnu' } })).toBe('champ inconnu')
})
it('conserve le contexte de l’observation pour la lecture privée des médias', () => {
  expect(evidencePath('a/b', 'observations', 'obs/1', true)).toBe('/api/evidence/a%2Fb/file?context=observations&recordId=obs%2F1')
})
