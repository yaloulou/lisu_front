import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../src/lib/api'
import { SearchExcerpt } from '../src/components/SearchExcerpt'
import { RecordList } from '../src/pages/Records'
import type { User } from '../src/lib/data'

vi.mock('../src/lib/api', () => ({ api: vi.fn(), upload: vi.fn(), API_BASE: 'http://localhost:3000', recordPath: (resource: string, id?: string) => `/api/${resource}${id ? '/' + id : ''}` }))
const user: User = { _id: 'analyst', role: 'analyste', desk: 'CCOC', email: 'test@example.test', actif: true }
const original = 'Une longue description commence ici. Attaque ADF Beni.'
const item = { _id: 'incident', event: { event_type: 'Incident', description: original }, search_highlights: ['Attaque <mark>ADF</mark> Beni.'] }
beforeEach(() => { vi.mocked(api).mockReset() })

it('garde une seule barre et transmet les mots ordinaires sans syntaxe spéciale', async () => {
  vi.mocked(api).mockImplementation(async (_path, options) => options?.body && (options.body as { search?: string }).search
    ? { items: [item], count: 1 } : { items: [], count: 0 })
  const view = render(<RecordList resource="intel" user={user} />)
  const search = screen.getByRole('textbox', { name: 'Rechercher' })
  expect(search.getAttribute('placeholder')).toBe('Rechercher dans la description…')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Rechercher', exact: true }).hasAttribute('disabled')).toBe(false))
  await userEvent.type(search, 'attaque ADF Beni')
  await userEvent.click(screen.getByRole('button', { name: 'Rechercher', exact: true }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/api/intel/search', expect.objectContaining({ body: { search: 'attaque ADF Beni', size: 500 } })))
  await screen.findByText('ADF', { selector: 'mark' })
  expect(view.container.querySelectorAll('mark')).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }))
  await screen.findByText('Aucun enregistrement trouvé')
  expect((search as HTMLInputElement).value).toBe('')
  expect(view.container.querySelector('mark')).toBeNull()
})

it('affiche la description originale en l’absence d’extrait ou de recherche', async () => {
  vi.mocked(api).mockResolvedValue({ items: [item], count: 1 })
  const view = render(<RecordList resource="intel" user={user} />)
  await screen.findByText(original)
  expect(view.container.querySelector('mark')).toBeNull()
  vi.mocked(api).mockResolvedValue({ items: [{ ...item, search_highlights: [] }], count: 1 })
  await userEvent.type(screen.getByRole('textbox', { name: 'Rechercher' }), 'ADF')
  await userEvent.click(screen.getByRole('button', { name: 'Rechercher', exact: true }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/api/intel/search', expect.objectContaining({ body: { search: 'ADF', size: 500 } })))
  expect(await screen.findByText(original)).toBeTruthy()
})

it('rend les extraits comme du texte et conserve seulement le surlignage prévu', () => {
  const view = render(<SearchExcerpt fragments={['<mark>ADF</mark> &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; rapport', '<img src=x onerror=alert(1)> <mark>FARDC</mark>']} />)
  expect(view.container.textContent).toContain('ADF <script>alert("x")</script> & rapport')
  expect(view.container.textContent).toContain('<img src=x onerror=alert(1)> FARDC')
  expect(view.container.querySelectorAll('mark')).toHaveLength(2)
  expect(view.container.querySelector('script, img')).toBeNull()
})

it('charge les territoires de la province choisie et combine géographie, mots et dates', async () => {
  vi.mocked(api).mockImplementation(async path => {
    if (path === '/api/intel-dashboard/provinces') return { items: ['Nord-Kivu', 'Ituri'] }
    if (path.includes('/territoires?')) return { items: ['Lubero', 'Beni'] }
    return { items: [], count: 0 }
  })
  render(<RecordList resource="intel" user={user} />)
  const province = screen.getByRole('combobox', { name: 'Province' }), territory = screen.getByRole('combobox', { name: 'Territoire' })
  expect((territory as HTMLSelectElement).disabled).toBe(true)
  expect(vi.mocked(api).mock.calls.some(([path]) => path.includes('/territoires?'))).toBe(false)
  await screen.findByRole('option', { name: 'Nord-Kivu' })
  expect(within(province).getAllByRole('option').map(option => option.textContent)).toEqual(['Toutes les provinces', 'Ituri', 'Nord-Kivu'])
  await userEvent.selectOptions(province, 'Nord-Kivu')
  await screen.findByRole('option', { name: 'Beni' })
  expect(api).toHaveBeenCalledWith('/api/intel-dashboard/territoires?province=Nord-Kivu', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  await userEvent.selectOptions(territory, 'Beni')
  await userEvent.type(screen.getByRole('textbox', { name: 'Rechercher' }), 'attaque ADF')
  fireEvent.change(screen.getByLabelText('Date de début'), { target: { value: '2026-10-01' } })
  await userEvent.click(screen.getByRole('button', { name: 'Rechercher', exact: true }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/api/intel/search', expect.objectContaining({
    body: { search: 'attaque ADF', province_region: 'Nord-Kivu', territoire_ville: 'Beni', dateFrom: '2026-10-01', size: 500 },
  })))
  await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }))
  expect((province as HTMLSelectElement).value).toBe('')
  expect((territory as HTMLSelectElement).value).toBe('')
  expect((territory as HTMLSelectElement).disabled).toBe(true)
  expect(within(territory).queryByRole('option', { name: 'Beni' })).toBeNull()
  await waitFor(() => expect(api).toHaveBeenLastCalledWith('/api/intel/search', expect.objectContaining({ body: { size: 500 } })))
})

it('efface le territoire quand la province change et ignore une réponse tardive d’une ancienne province', async () => {
  let finishIturi!: (value: { items: string[] }) => void
  let ituriSignal: AbortSignal | undefined
  vi.mocked(api).mockImplementation(async (path, settings) => {
    if (path === '/api/intel-dashboard/provinces') return { items: ['Nord-Kivu', 'Ituri', 'Sud-Kivu'] }
    if (path.endsWith('province=Nord-Kivu')) return { items: ['Beni'] }
    if (path.endsWith('province=Ituri')) {
      ituriSignal = settings?.signal
      return new Promise(resolve => { finishIturi = resolve })
    }
    if (path.endsWith('province=Sud-Kivu')) return { items: ['Uvira'] }
    return { items: [], count: 0 }
  })
  render(<RecordList resource="intel" user={user} />)
  await screen.findByRole('option', { name: 'Nord-Kivu' })
  const province = screen.getByRole('combobox', { name: 'Province' }), territory = screen.getByRole('combobox', { name: 'Territoire' })
  await userEvent.selectOptions(province, 'Nord-Kivu')
  await screen.findByRole('option', { name: 'Beni' })
  await userEvent.selectOptions(territory, 'Beni')
  await userEvent.selectOptions(province, 'Ituri')
  expect((territory as HTMLSelectElement).value).toBe('')
  expect((territory as HTMLSelectElement).disabled).toBe(true)
  expect(within(territory).queryByRole('option', { name: 'Beni' })).toBeNull()
  await userEvent.selectOptions(province, 'Sud-Kivu')
  await screen.findByRole('option', { name: 'Uvira' })
  expect(ituriSignal?.aborted).toBe(true)
  await act(async () => finishIturi({ items: ['Irumu'] }))
  expect(within(territory).queryByRole('option', { name: 'Irumu' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Rechercher', exact: true }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/api/intel/search', expect.objectContaining({ body: {
    province_region: 'Sud-Kivu', territoire_ville: undefined, size: 500,
  } })))
})

it('permet de réessayer le chargement des provinces et territoires en cas d’échec', async () => {
  let failProvinces = true, failTerritories = true
  vi.mocked(api).mockImplementation(async path => {
    if (path === '/api/intel-dashboard/provinces') {
      if (failProvinces) throw new Error('Connexion interrompue')
      return { items: ['Nord-Kivu'] }
    }
    if (path.includes('/territoires?')) {
      if (failTerritories) throw new Error('Connexion interrompue')
      return { items: ['Beni'] }
    }
    return { items: [], count: 0 }
  })
  render(<RecordList resource="intel" user={user} />)
  await screen.findByText('Impossible de charger les provinces.')
  expect((screen.getByRole('combobox', { name: 'Province' }) as HTMLSelectElement).disabled).toBe(true)
  failProvinces = false
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer les provinces' }))
  await screen.findByRole('option', { name: 'Nord-Kivu' })
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Province' }), 'Nord-Kivu')
  await screen.findByText('Impossible de charger les territoires de cette province.')
  const territory = screen.getByRole('combobox', { name: 'Territoire' })
  expect((territory as HTMLSelectElement).disabled).toBe(true)
  expect(territory.getAttribute('aria-busy')).toBe('false')
  failTerritories = false
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer les territoires' }))
  await screen.findByRole('option', { name: 'Beni' })
  expect((territory as HTMLSelectElement).disabled).toBe(false)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('autorise la recherche par province seule même si aucun territoire n’est disponible', async () => {
  vi.mocked(api).mockImplementation(async path => path === '/api/intel-dashboard/provinces' ? { items: ['Ituri'] } : { items: [], count: 0 })
  render(<RecordList resource="intel" user={user} />)
  await screen.findByRole('option', { name: 'Ituri' })
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Province' }), 'Ituri')
  await screen.findByRole('option', { name: 'Aucun territoire disponible' })
  await userEvent.click(screen.getByRole('button', { name: 'Rechercher', exact: true }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/api/intel/search', expect.objectContaining({ body: {
    province_region: 'Ituri', territoire_ville: undefined, size: 500,
  } })))
})

it('ne charge pas les listes CCOC dans les autres modules', async () => {
  vi.mocked(api).mockResolvedValue({ items: [], count: 0 })
  render(<RecordList resource="events" user={user} />)
  await screen.findByText('Aucun enregistrement trouvé')
  expect(api).toHaveBeenCalledTimes(1)
  expect(api).toHaveBeenCalledWith('/api/events/search', expect.anything())
})
