import { createRef, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { api, upload } from '../src/lib/api'
import { Evidence } from '../src/components/Evidence'
import type { EvidenceHandle } from '../src/components/Evidence'
import type { Data, EvidenceRef, User } from '../src/lib/data'
import { Distribution, RecordEditor } from '../src/pages/Records'
import { Users } from '../src/pages/Users'
import { configs } from '../src/lib/resources'

vi.mock('../src/lib/api', () => ({ api: vi.fn(), upload: vi.fn(), API_BASE: 'http://localhost:3000', recordPath: (resource: string, id?: string) => `/api/${resource}${id ? '/' + encodeURIComponent(id) : ''}`, evidencePath: (id: string) => `/api/evidence/${id}` }))
vi.mock('../src/lib/auth', () => ({ refreshProfile: vi.fn() }))
const current: User = { _id: 'reviewer', email: 'test@example.test', role: 'admin', desk: 'cord_intel', actif: true }
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(upload).mockReset(); window.location.hash = '/' })

it('envoie uniquement les fichiers restant en attente après un échec partiel', async () => {
  const ref = createRef<EvidenceHandle>()
  vi.mocked(api).mockResolvedValue({ title: 'document' })
  vi.mocked(upload).mockResolvedValueOnce({ evidence: { doc_id: 'doc1', type: 'image' }, document: { title: 'photo.png' } }).mockRejectedValueOnce(new Error('Connexion interrompue')).mockResolvedValueOnce({ evidence: { doc_id: 'doc2', type: 'audio' }, document: { title: 'audio.mp3' } })
  let latest: EvidenceRef[] = []
  function Draft() { const [value, setValue] = useState<EvidenceRef[]>([]); latest = value; return <Evidence value={value} ref={ref} context="observations" onChange={setValue} /> }
  render(<Draft />)
  await userEvent.upload(screen.getByLabelText('Ajouter des pièces jointes'), [new File(['photo'], 'photo.png', { type: 'image/png' }), new File(['audio'], 'audio.mp3', { type: 'audio/mpeg' })])
  await act(async () => { await expect(ref.current!.uploadAll()).rejects.toThrow('Connexion interrompue') })
  expect(latest).toEqual([{ doc_id: 'doc1', type: 'image' }])
  await act(async () => { await ref.current!.uploadAll() })
  expect(upload).toHaveBeenCalledTimes(3)
  expect(latest.map(ref => ref.doc_id)).toEqual(['doc1', 'doc2'])
  const sent = vi.mocked(upload).mock.calls[2][1].get('file') as File
  expect(sent.name).toBe('audio.mp3')
})

it('affiche les desks non éligibles et transmet la révision réellement contrôlée', async () => {
  const success = vi.fn()
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path === '/api/observations/desks') return { items: ['desk_est', 'desk_terrain'], eligible_desks: ['desk_est'] }
    if (options?.method === 'PUT') return {}
    return {}
  })
  render(<Distribution record={{ _id: 'obs1', summary: 'Information à vérifier', _seq_no: 7, _primary_term: 2 }} onClose={vi.fn()} onSuccess={success} />)
  const east = await screen.findByRole('checkbox', { name: /desk_est/ }), terrain = screen.getByRole('checkbox', { name: /desk_terrain/ }) as HTMLInputElement
  expect(terrain.disabled).toBe(true)
  await userEvent.click(east)
  await userEvent.click(screen.getByRole('button', { name: 'Valider et distribuer' }))
  await waitFor(() => expect(success).toHaveBeenCalledOnce())
  expect(api).toHaveBeenCalledWith('/api/observations/obs1/validation', { method: 'PUT', body: { target_desks: ['desk_est'], _seq_no: 7, _primary_term: 2 } })
})

it('conserve une validation périmée ouverte et présente le conflit du serveur', async () => {
  const success = vi.fn()
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === '/api/observations/desks') return { items: ['desk_est'], eligible_desks: ['desk_est'] }
    throw new Error('Cette information a changé. Rechargez-la.')
  })
  render(<Distribution record={{ _id: 'obs1', summary: 'Test', _seq_no: 0, _primary_term: 1 }} onClose={vi.fn()} onSuccess={success} />)
  await userEvent.click(await screen.findByRole('checkbox', { name: /desk_est/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Valider et distribuer' }))
  expect(await screen.findByText('Cette information a changé. Rechargez-la.')).toBeTruthy()
  expect(success).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeTruthy()
})

it('enregistre le nom de desk saisi lors de la création d’un utilisateur, sans Entrée', async () => {
  vi.mocked(api).mockImplementation(async (path, options) => path === '/users' && options?.method === 'POST' ? { _id: 'new-user' } : [])
  render(<Users user={current} />)
  await userEvent.click(screen.getByRole('button', { name: 'Nouvel utilisateur' }))
  await userEvent.type(screen.getByLabelText(/Adresse email/), 'analyste@example.test')
  await userEvent.type(screen.getByLabelText(/^Mot de passe/), 'password-only-for-test')
  await userEvent.type(screen.getByLabelText('Desk'), ' desk_nouveau ')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer', exact: true }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/users', expect.objectContaining({ method: 'POST', body: expect.objectContaining({ role: 'analyste', desk: 'desk_nouveau', email: 'analyste@example.test' }) })))
})

it.each(['observations', 'events', 'entities', 'links', 'intel'] as const)('ouvre et enregistre un formulaire %s compatible avec son endpoint', async resource => {
  const initial: Data = {
    ...configs[resource].defaults(), _id: 'record1', name: 'Entité test', summary: 'Information test', title: 'Renseignement test',
    from_entity: 'ent1', to_entity: 'ent2', link_type: 'collaboration', event_type: 'Incident',
    event: { date_event: '2026-10-30T10:00:00Z', event_type: 'Incident', description: 'Description test' },
    location: { province_region: 'Province test', territoire_ville: 'Ville test', localite_village_lieuprecis: 'Lieu test' },
    audit: { created_by: 'original-author' },
  }
  vi.mocked(api).mockImplementation(async (_path, options) => options?.method === 'PUT' ? { id: 'record1' } : initial)
  render(<RecordEditor resource={resource} id="record1" user={current} />)
  const button = await screen.findByRole('button', { name: 'Enregistrer les modifications' })
  fireEvent.submit(button.closest('form')!)
  await waitFor(() => expect(api).toHaveBeenCalledWith(`/api/${resource}/record1`, expect.objectContaining({ method: 'PUT', body: expect.objectContaining({ audit: expect.objectContaining({ created_by: 'original-author', updated_by: 'reviewer' }) }) })))
})
