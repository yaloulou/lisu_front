import { describe, expect, it } from 'vitest'
import { canCcoc, canCreate, canDelete, canEdit, canRead, canReview } from '../src/lib/data'
import type { Resource, Role, User } from '../src/lib/data'
import { configs, normalizeRecord } from '../src/lib/resources'
import { selectFiles } from '../src/lib/evidence'
import { recordPoints, summarizeIncidents } from '../src/lib/analytics'
const user = (role: Role, desk = ''): User => ({ _id: 'user1', role, desk, email: 'test@example.test', actif: true })

describe('Permissions identiques aux routes du backend', () => {
  it.each<Role>(['officier', 'analyste', 'conseiller', 'coordinateur', 'admin'])('réserve la revue au desk cord_intel pour %s', role => {
    expect(canReview(user(role, ' CORD_INTEL '))).toBe(true)
    expect(canEdit(user(role, 'cord_intel'), 'observations')).toBe(true)
    expect(canDelete(user(role, 'cord_intel'), 'observations')).toBe(true)
    expect(canEdit(user(role), 'observations')).toBe(false)
  })
  it.each<[Role, string, boolean]>([['admin', '', true], ['analyste', ' CCOC ', true], ['analyste', 'desk_est', false], ['conseiller', 'CCOC', false], ['coordinateur', 'CCOC', false], ['officier', 'CCOC', false]])('contrôle les CCOC pour %s / %s', (role, desk, expected) => {
    expect(canCcoc(user(role, desk))).toBe(expected)
    expect(canRead(user(role, desk), 'intel')).toBe(expected)
    expect(canCreate(user(role, desk), 'intel')).toBe(expected)
  })
  it('applique les droits de création et de suppression des autres ressources', () => {
    for (const resource of ['entities', 'events', 'links'] as Resource[]) {
      expect(canCreate(user('officier'), resource)).toBe(false)
      expect(canRead(user('officier'), resource)).toBe(false)
      expect(canCreate(user('analyste'), resource)).toBe(true)
      expect(canDelete(user('analyste'), resource)).toBe(false)
    }
    expect(canDelete(user('coordinateur'), 'events')).toBe(true)
    expect(canDelete(user('coordinateur'), 'entities')).toBe(false)
    expect(canDelete(user('admin'), 'entities')).toBe(true)
    expect(canCreate(user('officier'), 'observations')).toBe(true)
    expect(canCreate(user('conseiller'), 'observations')).toBe(false)
    expect(canRead(null, 'observations')).toBe(false)
  })
})

describe('Payloads métier compatibles avec les index actuels', () => {
  it('conserve la révision, les évidences et l’audit original lors de la correction d’une observation', () => {
    const value = normalizeRecord('observations', { ...configs.observations.defaults(), _id: 'obs1', _seq_no: 3, _primary_term: 1, summary: 'Fait constaté', evidence: [{ doc_id: 'doc1' }], audit: { created_by: 'author', created_at: '2026-01-01T00:00:00Z' } }, user('coordinateur', 'cord_intel'))
    expect(value._seq_no).toBe(3)
    expect(value.evidence).toEqual([{ doc_id: 'doc1' }])
    expect(value.audit).toMatchObject({ created_by: 'author', updated_by: 'user1' })
  })
  it('valide les coordonnées ensemble et conserve les coordonnées égales à zéro', () => {
    const base = { ...configs.entities.defaults(), name: 'Lieu A', entity_type: 'lieu', attributes: { lieu: { geo: { lat: 0, lon: 23 } } } }
    expect(normalizeRecord('entities', base, user('analyste')).attributes).toEqual({ lieu: { geo: { lat: 0, lon: 23 } } })
    expect(() => normalizeRecord('entities', { ...base, attributes: { lieu: { geo: { lat: 4, lon: '' } } } }, user('analyste'))).toThrow('ensemble')
  })
  it('refuse les dates inversées, les bilans négatifs et les champs obligatoires vides', () => {
    expect(() => normalizeRecord('events', { title: 'Test', event_type: 'Incident', time: { start: '2026-10-04T12:00', end: '2026-10-03T12:00' } }, user('analyste'))).toThrow('date de fin')
    expect(() => normalizeRecord('events', { ...configs.events.defaults(), title: 'Test', event_type: 'Incident', impact: { morts: -1 } }, user('analyste'))).toThrow('invalide')
    expect(() => normalizeRecord('observations', { ...configs.observations.defaults(), summary: '   ' }, user('officier'))).toThrow('obligatoire')
  })
  it('convertit les étiquettes et les identifiants sans perdre les tableaux vides de suppression', () => {
    const value = normalizeRecord('entities', { ...configs.entities.defaults(), name: 'Test', aliases: 'A, B, ', contacts: [], media_refs: [] }, user('analyste'))
    expect(value.aliases).toEqual(['A', 'B'])
    expect(value.contacts).toEqual([])
    expect(value.media_refs).toEqual([])
  })
  it('permet la suppression de toutes les pièces jointes existantes', () => {
    expect(normalizeRecord('events', { ...configs.events.defaults(), title: 'Test', event_type: 'Incident', evidence: [] }, user('analyste')).evidence).toEqual([])
  })
})

describe('Sélection des médias', () => {
  it('cumule les sélections, refuse les doublons, fichiers vides et formats actifs', () => {
    const photo = new File(['photo'], 'image.png', { lastModified: 1 })
    const result = selectFiles([photo, new File(['html'], 'page.html'), new File([], 'empty.mp4')], 0, [photo])
    expect(result.pending).toEqual([photo])
    expect(result.error).toContain('vide')
  })
  it('compte les pièces existantes dans la limite de vingt et refuse les gros fichiers', () => {
    const file = new File(['data'], 'test.mp4')
    expect(selectFiles([file], 20, []).pending).toHaveLength(0)
    Object.defineProperty(file, 'size', { value: 101 * 1024 * 1024 })
    expect(selectFiles([file], 0, []).error).toContain('100 Mo')
  })
})

describe('Analyse et cartographie', () => {
  it('calcule les bilans et groupes à partir des données du serveur', () => {
    const stats = summarizeIncidents([{ event: { event_type: 'Test', date_event: '2026-10-30' }, location: { province_region: 'Province A' }, degats_humains: { morts_civils: 2, morts_allies: 1, blesses_civils: 4 } }])
    expect(stats.deaths).toBe(3); expect(stats.injured).toBe(4); expect(stats.provinces).toEqual({ 'Province A': 1 })
  })
  it('exclut les coordonnées invalides sans inventer de localisation et encode les liens', () => {
    const points = recordPoints('entities', [{ id: 'a/b', name: 'Lieu', attributes: { lieu: { geo: { lat: 0, lon: 20 } } } }, { id: 'bad', locations: [{ geo: { lat: 100, lon: 2 } }] }])
    expect(points).toHaveLength(1); expect(points[0].lat).toBe(0); expect(points[0].href).toContain('a%2Fb')
  })
})
