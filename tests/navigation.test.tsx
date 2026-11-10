import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { api } from '../src/lib/api'
import type { User } from '../src/lib/data'
import App from '../src/App'
const session = vi.hoisted(() => ({ user: null as User | null, loading: false }))
vi.mock('../src/lib/auth', () => ({ useSession: () => session, logout: vi.fn(), refreshProfile: vi.fn().mockResolvedValue(null) }))
vi.mock('../src/lib/api', () => ({ api: vi.fn().mockResolvedValue({ items: [], count: 0 }), upload: vi.fn(), API_BASE: 'http://localhost:3000', recordPath: (resource: string, id?: string) => `/api/${resource}${id ? '/' + id : ''}`, evidencePath: () => '/api/evidence' }))
beforeEach(() => { session.user = { _id: 'user', email: 'test@example.test', role: 'analyste', desk: 'desk_est', actif: true }; window.location.hash = '/observations'; vi.mocked(api).mockResolvedValue({ items: [], count: 0 }) })
it('réserve les menus CCOC aux analystes CCOC et aux administrateurs', async () => {
  const view = render(<App />)
  expect(screen.queryByRole('link', { name: 'Enregistrer CCOC' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Gestion utilisateurs' })).toBeNull()
  session.user = { ...session.user!, desk: 'CCOC' }; view.rerender(<App />)
  expect(screen.getByRole('link', { name: 'Enregistrer CCOC' })).toBeTruthy()
  session.user = { ...session.user!, role: 'admin', desk: '' }; view.rerender(<App />)
  expect(screen.getByRole('link', { name: 'Gestion utilisateurs' })).toBeTruthy()
  await screen.findByText('Aucune information à afficher')
})
it('bloque un accès direct à la création CCOC et à la gestion des comptes', () => {
  window.location.hash = '/dashboard'
  const view = render(<App />)
  expect(screen.getByText('Cette page n’est pas accessible')).toBeTruthy()
  window.location.hash = '/admin/users'; view.rerender(<App />)
  expect(screen.getByText('Cette page n’est pas accessible')).toBeTruthy()
})

it('transmet les filtres du tableau de bord à la recherche CCOC et permet de les retirer', async () => {
  session.user = { ...session.user!, desk: 'CCOC' }
  window.location.hash = '/search?province_region=Nord-Kivu&territoire_ville=Beni&actor=Alpha&impact=civilian_deaths&event=Attaque&dateFrom=2026-10-01&dateTo=2026-10-03'
  render(<App />)
  await screen.findByText('Aucun enregistrement trouvé')
  expect(api).toHaveBeenCalledWith('/api/intel/search', expect.objectContaining({ body: {
    province_region: 'Nord-Kivu', territoire_ville: 'Beni', actor: 'Alpha', impact: 'civilian_deaths', event: 'Attaque', dateFrom: '2026-10-01', dateTo: '2026-10-03', size: 500,
  } }))
  expect(screen.getByText('Acteur : Alpha')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Retirer le filtre acteur' }))
  expect(screen.queryByText('Acteur : Alpha')).toBeNull()
  expect(api).toHaveBeenCalledWith('/api/intel/search', expect.objectContaining({ body: expect.objectContaining({ actor: undefined, impact: 'civilian_deaths', province_region: 'Nord-Kivu' }) }))
})
it('cache les modules non autorisés aux officiers tout en permettant leur dépôt d’information', async () => {
  session.user = { ...session.user!, role: 'officier', desk: 'terrain' }
  render(<App />)
  for (const label of ['Entités', 'Renseignements', 'Relations', 'Enregistrer CCOC']) expect(screen.queryByRole('link', { name: label })).toBeNull()
  expect(screen.getByRole('button', { name: /Nouvelle information/ })).toBeTruthy()
  await screen.findByText('Aucune information à afficher')
})

it('permet à un officier de consulter son information en attente sans proposer les actions de validation ou de modification', async () => {
  session.user = { ...session.user!, role: 'officier', desk: 'terrain' }
  const own = { _id: 'my-observation', owner_id: 'user', summary: 'Information déposée par moi', obs_type: 'autre', time: { observed_at: '2026-10-31T10:00:00Z' }, workflow: { status: 'pending', target_desks: [] }, evidence: [] }
  vi.mocked(api).mockImplementation(async path => path.endsWith('/search') ? { items: [own], count: 1 } : own)
  render(<App />)
  expect(await screen.findByText('Information déposée par moi')).toBeTruthy()
  expect(screen.getByText('En attente')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Consulter Information déposée par moi' }))
  expect(await screen.findByText('Traçabilité')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Information déposée par moi' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull()
})
