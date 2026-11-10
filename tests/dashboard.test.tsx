import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { api } from '../src/lib/api'
import { Dashboard } from '../src/pages/Dashboard'
import {
  comparison,
  dashboardDefaults,
  dashboardSearch,
  initialIntelFilters,
} from '../src/lib/dashboard'
import { dashboardFixture } from './fixtures/dashboard'

vi.mock('../src/lib/api', () => ({ api: vi.fn() }))
beforeEach(() => {
  window.location.hash = '/board'
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === '/api/intel-dashboard/summary')
      return structuredClone(dashboardFixture)
    if (path === '/api/intel-dashboard/provinces')
      return { items: ['Nord-Kivu'] }
    return { items: ['Beni'] }
  })
})

it('affiche les totaux complets du serveur, les comparaisons et les bilans sans compter les fiches chargées', async () => {
  const view = render(<Dashboard />)
  const total = await screen.findByRole('button', {
    name: /Incidents enregistrés : 12.*543/,
  })
  expect(total.textContent).toContain('12')
  expect(screen.getByText(/\+50 %/)).toBeTruthy()
  expect(screen.getByText(/Sans base de comparaison/)).toBeTruthy()
  expect(
    screen.getByRole('heading', { name: 'Qualité et fraîcheur des données' }),
  ).toBeTruthy()
  expect(
    screen.getByRole('heading', { name: 'Dégâts matériels recensés' }),
  ).toBeTruthy()
  expect(
    screen.getByRole('heading', { name: 'Acteurs mentionnés' }),
  ).toBeTruthy()
  expect(
    screen.getByText('Description fictive du fait enregistré.'),
  ).toBeTruthy()
  expect(view.container.querySelectorAll('.time-bar')).toHaveLength(2)
  expect(view.container.querySelector('.dashboard-kpi.red')).toBeTruthy()
})

it('ouvre les fiches avec la période et les filtres de territoire, acteur, nature et bilan', async () => {
  render(<Dashboard />)
  await screen.findByRole('heading', { name: 'Acteurs mentionnés' })
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Consulter les fiches de Beni, Nord-Kivu',
    }),
  )
  expect(initialIntelFilters(window.location.hash.split('?')[1])).toMatchObject(
    {
      province_region: 'Nord-Kivu',
      territoire_ville: 'Beni',
      dateFrom: '2026-10-05',
      dateTo: '2026-11-03',
    },
  )
  await userEvent.click(
    screen.getByRole('button', { name: /Groupe fictif Alpha :/ }),
  )
  expect(initialIntelFilters(window.location.hash.split('?')[1]).actor).toBe(
    'Groupe fictif Alpha',
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Consulter la nature Attaque' }),
  )
  expect(initialIntelFilters(window.location.hash.split('?')[1]).event).toBe(
    'Attaque',
  )
  await userEvent.click(
    screen.getByRole('button', { name: /Décès civils recensés :/ }),
  )
  expect(initialIntelFilters(window.location.hash.split('?')[1]).impact).toBe(
    'civilian_deaths',
  )
})

it('valide les dates et applique les périodes rapides', async () => {
  render(<Dashboard />)
  await screen.findByRole('heading', { name: 'Acteurs mentionnés' })
  fireEvent.change(screen.getByLabelText('Date de début'), {
    target: { value: '2026-11-04' },
  })
  fireEvent.change(screen.getByLabelText('Date de fin'), {
    target: { value: '2026-11-03' },
  })
  await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }))
  expect(screen.getByRole('alert').textContent).toContain('bon ordre')
  expect(
    vi
      .mocked(api)
      .mock.calls.filter(([path]) => path === '/api/intel-dashboard/summary'),
  ).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: '7 jours' }))
  const expected = dashboardDefaults(7)
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/api/intel-dashboard/summary',
      expect.objectContaining({ body: expected }),
    ),
  )
})

it('présente une erreur de chargement avec une possibilité de réessayer', async () => {
  let unavailable = true
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === '/api/intel-dashboard/summary') {
      if (unavailable) throw new Error('Calcul indisponible')
      return structuredClone(dashboardFixture)
    }
    return { items: [] }
  })
  render(<Dashboard />)
  await screen.findByText('Calcul indisponible')
  unavailable = false
  await userEvent.click(
    screen.getByRole('button', { name: 'Réessayer', exact: true }),
  )
  await screen.findByRole('heading', { name: 'Acteurs mentionnés' })
})

it('évite les pourcentages trompeurs quand la période précédente vaut zéro', () => {
  expect(comparison(5, 0)).toEqual({
    difference: 5,
    percent: null,
    label: 'Sans base de comparaison',
  })
  expect(comparison(0, 0).label).toBe('Stable')
  expect(comparison(0, 5).percent).toBe(-100)
  expect(dashboardDefaults(7, new Date('2026-11-02T23:30:00Z'))).toMatchObject({
    dateFrom: '2026-10-28',
    dateTo: '2026-11-03',
  })
  expect(
    initialIntelFilters(
      dashboardSearch(
        {
          province: 'Nord Kivu',
          territoire: 'Beni',
          dateFrom: '2026-10-05',
          dateTo: '2026-11-03',
        },
        { actor: 'Alpha & Bravo' },
      ).split('?')[1],
    ),
  ).toMatchObject({ actor: 'Alpha & Bravo', province_region: 'Nord Kivu' })
})
