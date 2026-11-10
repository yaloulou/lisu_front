import type { DashboardSummary } from '../../src/lib/dashboard'

export const dashboardFixture: DashboardSummary = {
  period: {
    from: '2026-10-05',
    to: '2026-11-03',
    previous_from: '2026-09-05',
    previous_to: '2026-10-04',
    days: 30,
    interval: 'day',
    time_zone: 'Africa/Kinshasa',
    includes_today: true,
  },
  generated_at: '2026-11-03T12:00:00Z',
  totals: {
    incidents: 12543,
    morts_civils: 12,
    deaths: 20,
    injured: 6,
    enleves_disparus: 2,
    degat_batiments: 3,
  },
  previous: {
    incidents: 12000,
    morts_civils: 8,
    injured: 0,
    enleves_disparus: 3,
  },
  provinces: [{ name: 'Nord-Kivu', incidents: 7 }],
  territories: [
    {
      province: 'Nord-Kivu',
      name: 'Beni',
      incidents: 7,
      civilian_deaths: 12,
      missing: 2,
    },
  ],
  actors: [{ name: 'Groupe fictif Alpha', incidents: 3 }],
  natures: [{ name: 'Attaque', incidents: 7, previous: 4 }],
  timeline: [
    { date: '2026-10-05', incidents: 0 },
    { date: '2026-10-06', incidents: 7 },
  ],
  quality: {
    without_province: 0,
    without_territory: 1,
    without_actor: 1,
    without_coordinates: 2,
    latest_update: '2026-11-03T10:00:00Z',
    breakdowns_approximate: false,
    actors_truncated: false,
  },
  latest: [
    {
      _id: 'fictional-1',
      event: {
        event_type: 'Attaque',
        date_event: '2026-10-06',
        description: 'Description fictive du fait enregistré.',
      },
      location: { province_region: 'Nord-Kivu', territoire_ville: 'Beni' },
      degats_humains: { morts_civils: 12, enleves_disparus: 2 },
    },
  ],
  significant: [],
}
