import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../lib/api'
import { dateLabel, get, idOf, string } from '../lib/data'
import type { Data } from '../lib/data'
import {
  calendarDay,
  comparison,
  dashboardDefaults,
  dashboardSearch,
  eventDay,
} from '../lib/dashboard'
import type {
  Breakdown,
  DashboardFilters,
  DashboardSummary,
} from '../lib/dashboard'
import { useRemote } from '../lib/hooks'
import { navigate } from '../lib/router'
import { Alert, Empty, Icon, Loading, PageHeader } from '../components/ui'
import { CcocLocationFilters } from '../components/CcocLocationFilters'

const number = (value = 0) => value.toLocaleString('fr-FR')
const humanGroups = [
  {
    title: 'Décès recensés',
    color: 'red',
    fields: [
      ['morts_civils', 'Civils'],
      ['morts_allies', 'Alliés'],
      ['morts_ennemis', 'Ennemis'],
    ],
  },
  {
    title: 'Blessures recensées',
    color: 'amber',
    fields: [
      ['blesses_civils', 'Civils'],
      ['blesses_allies', 'Alliés'],
      ['blesses_ennemis', 'Ennemis'],
    ],
  },
  {
    title: 'Autres conséquences humaines',
    color: 'violet',
    fields: [
      ['enleves_disparus', 'Enlevés / disparus'],
      ['expulses', 'Personnes expulsées'],
      ['arrestations_interpellations', 'Arrestations / interpellations'],
      ['violences_sexuelles', 'Violences sexuelles recensées'],
    ],
  },
]

function Bars({
  title,
  data,
  color = 'blue',
  onSelect,
  detail,
}: {
  title: string
  data: Breakdown[]
  color?: string
  onSelect: (name: string) => void
  detail?: string
}) {
  const max = Math.max(1, ...data.map((item) => item.incidents))
  return (
    <section className={`panel chart-panel dashboard-chart ${color}`}>
      <div className="section-heading">
        <h2>{title}</h2>
        <Icon name="chart" />
      </div>
      {detail && <p className="dashboard-note">{detail}</p>}
      {!data.length ? (
        <Empty title="Aucune donnée sur cette période" />
      ) : (
        <div className="dashboard-bars">
          {data.map((item) => (
            <button
              type="button"
              className="dashboard-bar"
              key={item.name}
              onClick={() => onSelect(item.name)}
              aria-label={`${item.name} : ${number(item.incidents)} incident(s), consulter les fiches`}
            >
              <span>
                <span>{item.name}</span>
                <strong>{number(item.incidents)}</strong>
              </span>
              <span className="dashboard-track">
                <span style={{ width: `${(item.incidents / max) * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function IncidentTable({
  title,
  items,
  significant = false,
  onAll,
}: {
  title: string
  items: Data[]
  significant?: boolean
  onAll: () => void
}) {
  return (
    <section className="panel dashboard-incidents">
      <div className="table-toolbar">
        <div>
          <h2>{title}</h2>
          {significant && (
            <p className="dashboard-note">
              Avec décès civils ou enlèvements. Ordre : décès civils, puis
              enlèvements, puis date.
            </p>
          )}
        </div>
        <button className="button quiet small" onClick={onAll}>
          Voir les fiches
          <Icon name="arrow" size={16} />
        </button>
      </div>
      {!items.length ? (
        <Empty title="Aucun incident correspondant" />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fait enregistré</th>
                <th>Lieu</th>
                <th>Date</th>
                <th>Décès civils</th>
                <th>Enlevés / disparus</th>
                <th>Fiche</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={idOf(item)}>
                  <td>
                    <strong>
                      {string(get(item, 'event.event_type')) ||
                        'Nature non renseignée'}
                    </strong>
                    <p className="dashboard-description">
                      {string(get(item, 'event.description')) ||
                        'Description non renseignée'}
                    </p>
                  </td>
                  <td>
                    {string(get(item, 'location.territoire_ville')) ||
                      'Territoire non renseigné'}
                    <small className="dashboard-location">
                      {string(get(item, 'location.province_region'))}
                    </small>
                  </td>
                  <td className="nowrap">
                    {eventDay(string(get(item, 'event.date_event')))}
                  </td>
                  <td>
                    {number(
                      Number(get(item, 'degats_humains.morts_civils')) || 0,
                    )}
                  </td>
                  <td>
                    {number(
                      Number(get(item, 'degats_humains.enleves_disparus')) || 0,
                    )}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Consulter ${string(get(item, 'event.event_type')) || idOf(item)}`}
                      onClick={() =>
                        navigate(`/incident/${encodeURIComponent(idOf(item))}`)
                      }
                    >
                      <Icon name="eye" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function Dashboard() {
  const [draftFilters, setDraft] = useState<DashboardFilters | null>(null)
  const [filters, setFilters] = useState<DashboardFilters | null>(null)
  const [error, setError] = useState('')
  const records = useRemote(
    useCallback(
      async (signal: AbortSignal) => {
        const loadSummary = (selection: DashboardFilters) =>
          api<DashboardSummary>('/api/intel-dashboard/summary', {
            method: 'POST',
            body: selection,
            signal,
          })
        const recent = await loadSummary(filters ?? dashboardDefaults())
        if (filters || recent.totals.incidents > 0) return { summary: recent }

        const history = await api<{ items: Data[] }>('/api/intel-dashboard/data', {
          method: 'POST',
          body: { size: 1, dateTo: recent.period.from },
          signal,
        })
        const latestDate = new Date(string(get(history.items?.[0], 'event.date_event')))
        if (!Number.isFinite(latestDate.getTime())) return { summary: recent }

        const historicalPeriod = dashboardDefaults(recent.period.days, latestDate)
        if (historicalPeriod.dateTo >= recent.period.from) return { summary: recent }
        return { summary: await loadSummary(historicalPeriod), historical: true }
      },
      [filters],
    ),
  )
  const summary = records.value?.summary
  const requested = filters ?? dashboardDefaults()
  const applied = summary
    ? { ...requested, dateFrom: summary.period.from, dateTo: summary.period.to }
    : requested
  const draft = draftFilters ?? applied
  const browse = (overrides: Record<string, string | undefined> = {}) =>
    navigate(dashboardSearch(applied, overrides))
  function apply(event: FormEvent) {
    event.preventDefault()
    if (!draft.dateFrom || !draft.dateTo || draft.dateFrom > draft.dateTo) {
      setError(
        'Choisissez une date de début et une date de fin dans le bon ordre.',
      )
      return
    }
    setError('')
    setFilters({ ...draft })
  }
  function shortcut(days: number) {
    const dates = dashboardDefaults(days)
    const next = { ...draft, dateFrom: dates.dateFrom, dateTo: dates.dateTo }
    setError('')
    setDraft(next)
    setFilters(next)
  }
  const totals = summary?.totals || {},
    previous = summary?.previous || {}
  const cards = [
    {
      key: 'incidents',
      label: 'Incidents enregistrés',
      color: 'blue',
      icon: 'shield',
      impact: undefined,
    },
    {
      key: 'morts_civils',
      label: 'Décès civils recensés',
      color: 'red',
      icon: 'entities',
      impact: 'civilian_deaths',
    },
    {
      key: 'injured',
      label: 'Personnes blessées',
      color: 'amber',
      icon: 'plus',
      impact: 'injured',
    },
    {
      key: 'enleves_disparus',
      label: 'Enlevés / disparus',
      color: 'violet',
      icon: 'search',
      impact: 'missing',
    },
  ]
  const timelineMax = Math.max(
    1,
    ...(summary?.timeline.map((item) => item.incidents) || []),
  )
  return (
    <div className="ccoc-dashboard">
      <PageHeader
        title="Tableau de bord CCOC"
        description="Évolution des faits enregistrés, territoires concernés et conséquences recensées."
        actions={
          <>
            <button
              className="button secondary"
              onClick={() => navigate('/mapdiplo?source=intel')}
            >
              <Icon name="map" />
              Voir la carte
            </button>
            <button
              className="button primary"
              onClick={() => navigate('/dashboard')}
            >
              <Icon name="plus" />
              Enregistrer CCOC
            </button>
          </>
        }
      />
      <section className="panel dashboard-filters">
        <form className="filters" onSubmit={apply}>
          <CcocLocationFilters
            province={draft.province}
            territoire={draft.territoire}
            onProvinceChange={(province) =>
              setDraft((previous) => ({
                ...(previous ?? draft),
                province,
                territoire: '',
              }))
            }
            onTerritoireChange={(territoire) =>
              setDraft((previous) => ({ ...(previous ?? draft), territoire }))
            }
          />
          <label className="date-filter">
            <span>Du</span>
            <input
              type="date"
              aria-label="Date de début"
              required
              value={draft.dateFrom}
              onChange={(event) =>
                setDraft({ ...draft, dateFrom: event.target.value })
              }
            />
          </label>
          <label className="date-filter">
            <span>Au</span>
            <input
              type="date"
              aria-label="Date de fin"
              required
              value={draft.dateTo}
              onChange={(event) =>
                setDraft({ ...draft, dateTo: event.target.value })
              }
            />
          </label>
          <button className="button primary" disabled={records.loading}>
            <Icon name="search" size={17} />
            Appliquer
          </button>
          <button
            className="button quiet"
            type="button"
            disabled={records.loading}
            onClick={records.reload}
          >
            <Icon name="refresh" size={17} />
            Actualiser
          </button>
        </form>
        <div className="dashboard-shortcuts">
          <span>Période rapide</span>
          {[7, 30, 90, 365].map((days) => (
            <button
              className="button secondary small"
              type="button"
              key={days}
              disabled={records.loading}
              onClick={() => shortcut(days)}
            >
              {days === 365 ? '1 an' : `${days} jours`}
            </button>
          ))}
          <button
            className="button quiet small"
            onClick={() => {
              setDraft(null)
              setFilters(null)
              setError('')
            }}
          >
            Réinitialiser
          </button>
        </div>
      </section>
      {error && <Alert error>{error}</Alert>}
      {records.error ? (
        <Alert error>
          {records.error}{' '}
          <button className="button secondary small" onClick={records.reload}>
            Réessayer
          </button>
        </Alert>
      ) : records.loading ? (
        <Loading text="Calcul des indicateurs CCOC…" />
      ) : summary ? (
        <>
          <div className="dashboard-period">
            <div>
              <strong>
                {calendarDay(summary.period.from)} –{' '}
                {calendarDay(summary.period.to)}
              </strong>
              <span>
                Comparaison : {calendarDay(summary.period.previous_from)} –{' '}
                {calendarDay(summary.period.previous_to)} ·{' '}
                {summary.period.days} jours par période
              </span>
            </div>
            <span>Calculé le {dateLabel(summary.generated_at)}</span>
          </div>
          {records.value?.historical && (
            <p className="dashboard-note">
              Les 30 derniers jours ne contiennent aucun incident enregistré.
              La période affichée se termine au dernier incident disponible.
            </p>
          )}
          {summary.period.includes_today && (
            <p className="dashboard-note">
              La période inclut la journée en cours, encore partielle. Les
              variations portent sur les faits enregistrés et peuvent évoluer
              avec les saisies tardives.
            </p>
          )}
          <div className="stat-grid">
            {cards.map((card) => {
              const current = totals[card.key] || 0,
                prior = previous[card.key] || 0,
                change = comparison(current, prior)
              return (
                <button
                  className={`stat-card dashboard-kpi ${card.color}`}
                  key={card.key}
                  onClick={() => browse({ impact: card.impact })}
                  aria-label={`${card.label} : ${number(current)}, consulter les fiches`}
                >
                  <div>
                    <span>{card.label}</span>
                    <strong>{number(current)}</strong>
                    <span
                      className={`dashboard-change ${change.difference > 0 ? 'increase' : change.difference < 0 ? 'decrease' : ''}`}
                    >
                      {change.difference > 0
                        ? '↑'
                        : change.difference < 0
                          ? '↓'
                          : '→'}{' '}
                      {change.label}
                    </span>
                    <small>
                      {number(prior)} auparavant · écart{' '}
                      {change.difference > 0 ? '+' : ''}
                      {number(change.difference)}
                    </small>
                  </div>
                  <span className={`stat-icon ${card.color}`}>
                    <Icon name={card.icon} />
                  </span>
                </button>
              )
            })}
          </div>
          {!totals.incidents && (
            <Alert>
              Aucun fait enregistré pour cette sélection. Les indicateurs
              restent à zéro ; élargissez la période ou modifiez la zone.
            </Alert>
          )}
          <section className="panel chart-panel dashboard-chart blue">
            <div className="section-heading">
              <h2>Évolution des incidents</h2>
              <span className="muted">
                {summary.period.interval === 'day'
                  ? 'Par jour'
                  : summary.period.interval === 'week'
                    ? 'Par semaine'
                    : 'Par mois'}{' '}
                · jours sans fait enregistré inclus
              </span>
            </div>
            <div
              className="time-chart dashboard-timeline"
              role="img"
              aria-label="Évolution du nombre d’incidents, périodes sans fait enregistré incluses"
            >
              {summary.timeline.map((item) => (
                <div
                  className="time-bar"
                  key={item.date}
                  title={`${calendarDay(item.date)} : ${number(item.incidents)} incident(s)`}
                >
                  <strong>{number(item.incidents)}</strong>
                  <span
                    style={{
                      height: `${item.incidents ? Math.max(4, (item.incidents / timelineMax) * 135) : 2}px`,
                      opacity: item.incidents ? 1 : 0.2,
                    }}
                  />
                  <small>{item.date.slice(5)}</small>
                </div>
              ))}
            </div>
          </section>
          <section className="panel dashboard-territories">
            <div className="table-toolbar">
              <div>
                <h2>Territoires avec le plus de faits enregistrés</h2>
                <p className="dashboard-note">
                  Classement par nombre de fiches, influencé par la remontée des
                  informations.
                </p>
              </div>
            </div>
            {!summary.territories.length ? (
              <Empty title="Aucun territoire renseigné" />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Territoire / ville</th>
                      <th>Province</th>
                      <th>Incidents</th>
                      <th>Décès civils</th>
                      <th>Enlevés / disparus</th>
                      <th>Fiches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.territories.map((item) => (
                      <tr key={`${item.province}:${item.name}`}>
                        <td>
                          <strong>{item.name}</strong>
                        </td>
                        <td>{item.province}</td>
                        <td>
                          <span className="dashboard-count">
                            {number(item.incidents)}
                          </span>
                        </td>
                        <td>{number(item.civilian_deaths)}</td>
                        <td>{number(item.missing)}</td>
                        <td>
                          <button
                            className="button quiet small"
                            onClick={() =>
                              browse({
                                province_region: item.province,
                                territoire_ville: item.name,
                              })
                            }
                            aria-label={`Consulter les fiches de ${item.name}, ${item.province}`}
                          >
                            Consulter
                            <Icon name="arrow" size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <div className="dashboard-grid">
            <Bars
              title="Incidents par province"
              data={summary.provinces}
              onSelect={(province) =>
                browse({
                  province_region: province,
                  territoire_ville: undefined,
                })
              }
            />
            <Bars
              title="Acteurs mentionnés"
              data={summary.actors}
              color="violet"
              detail="Fiches mentionnant chaque acteur, comptées une seule fois par acteur. Les implications sont celles rapportées dans les données."
              onSelect={(actor) => browse({ actor })}
            />
          </div>
          <section className="panel dashboard-natures">
            <div className="table-toolbar">
              <h2>Évolution par nature d’incident</h2>
            </div>
            {!summary.natures.length ? (
              <Empty title="Aucune nature d’incident renseignée" />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Nature</th>
                      <th>Période sélectionnée</th>
                      <th>Période précédente</th>
                      <th>Variation</th>
                      <th>Fiches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.natures.slice(0, 12).map((item) => (
                      <tr key={item.name}>
                        <td>{item.name}</td>
                        <td>{number(item.incidents)}</td>
                        <td>{number(item.previous)}</td>
                        <td>
                          {comparison(item.incidents, item.previous).label}
                        </td>
                        <td>
                          <button
                            className="button quiet small"
                            onClick={() => browse({ event: item.name })}
                            aria-label={`Consulter la nature ${item.name}`}
                          >
                            Consulter
                            <Icon name="arrow" size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <div className="dashboard-human-grid">
            {humanGroups.map((group) => (
              <section
                className={`panel dashboard-balance ${group.color}`}
                key={group.title}
              >
                <h2>{group.title}</h2>
                <dl>
                  {group.fields.map(([field, label]) => (
                    <div key={field}>
                      <dt>{label}</dt>
                      <dd>{number(totals[field])}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <section className="panel dashboard-material">
            <div>
              <h2>Dégâts matériels recensés</h2>
              <p className="dashboard-note">
                Comptages déclarés dans les fiches de la période.
              </p>
            </div>
            <dl>
              {[
                ['degat_batiments', 'Bâtiments endommagés'],
                ['degat_vehicules', 'Véhicules endommagés'],
                ['degat_infrastructures', 'Infrastructures endommagées'],
              ].map(([field, label]) => (
                <div key={field}>
                  <dt>{label}</dt>
                  <dd>{number(totals[field])}</dd>
                </div>
              ))}
            </dl>
          </section>
          <IncidentTable
            title="Incidents à fort impact humain"
            items={summary.significant}
            significant
            onAll={() => browse({ impact: 'significant' })}
          />
          <IncidentTable
            title="Derniers incidents de la période"
            items={summary.latest}
            onAll={() => browse()}
          />
          <section className="panel dashboard-quality">
            <h2>Qualité et fraîcheur des données</h2>
            <p className="dashboard-note">
              Dernière modification des fiches de la sélection :{' '}
              {summary.quality.latest_update
                ? dateLabel(summary.quality.latest_update)
                : 'non renseignée'}
              .
            </p>
            <div className="dashboard-quality-grid">
              {[
                ['without_province', 'Sans province'],
                ['without_territory', 'Sans territoire'],
                ['without_actor', 'Sans acteur'],
                ['without_coordinates', 'Sans coordonnées'],
              ].map(([field, label]) => {
                const count =
                  Number(
                    summary.quality[field as keyof typeof summary.quality],
                  ) || 0
                return (
                  <div key={field}>
                    <span>{label}</span>
                    <strong>{number(count)}</strong>
                    <small>
                      {totals.incidents
                        ? number(Math.round((count / totals.incidents) * 100))
                        : 0}{' '}
                      % des fiches
                    </small>
                  </div>
                )
              })}
            </div>
            <p className="dashboard-note">
              Les bilans sont ceux saisis dans les fiches. Un zéro peut aussi
              provenir d’une valeur non renseignée dans les anciennes saisies.
              Les totaux ne représentent pas nécessairement des personnes
              distinctes.
            </p>
            {(summary.quality.breakdowns_approximate ||
              summary.quality.actors_truncated) && (
              <Alert>
                Certains classements sont limités ou estimés par Elasticsearch.
                Les indicateurs globaux portent sur toutes les fiches de la
                sélection.
              </Alert>
            )}
          </section>
        </>
      ) : (
        <Empty />
      )}
    </div>
  )
}
