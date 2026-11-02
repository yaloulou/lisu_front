import { useCallback, useEffect, useId, useState } from 'react'
import { api } from '../lib/api'
import { asData, canRead, get, idOf, list, rows, set, string } from '../lib/data'
import type { Data, User } from '../lib/data'
import { useRemote } from '../lib/hooks'
import type { Collection, Field } from '../lib/resources'
import { Icon, Spinner } from './ui'

export function EntityPicker({ value, onChange, user, id, required }: { value: string; onChange: (value: string) => void; user: User; id: string; required?: boolean }) {
  const [query, setQuery] = useState(''), [search, setSearch] = useState('')
  const allowed = canRead(user, 'entities')
  useEffect(() => { const timer = setTimeout(() => setSearch(query), 300); return () => clearTimeout(timer) }, [query])
  const results = useRemote(useCallback(async (signal: AbortSignal) => search.trim().length < 2 || !allowed ? [] : list(await api('/api/entities/search', { method: 'POST', body: { query: search, size: 15 }, signal })).items, [search, allowed]))
  const current = useRemote<Data>(useCallback(async (signal: AbortSignal) => value && allowed ? api(`/api/entities/${encodeURIComponent(value)}`, { signal }) : {}, [value, allowed]))
  if (!allowed) return <input id={id} value={value} required={required} onChange={event => onChange(event.target.value)} placeholder="Identifiant de l’entité (facultatif selon le champ)" />
  return <div className="entity-picker">
    {value && <div className="entity-selected"><Icon name="entities" size={16} /><span>{string(current.value?.name) || value}</span><button type="button" className="icon-button" onClick={() => onChange('')} aria-label="Retirer l’entité"><Icon name="close" size={14} /></button></div>}
    <input id={id} value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher une entité par nom…" autoComplete="off" required={required && !value} aria-label="Rechercher une entité" />
    {query.trim().length >= 2 && <div className="suggestions">{results.loading ? <Spinner /> : results.error ? <p className="error-text">{results.error}</p> : !results.value?.length ? <p>Aucune entité trouvée.</p> : results.value.map(item => <button type="button" key={idOf(item)} onClick={() => { onChange(idOf(item)); setQuery('') }}><span>{string(item.name)}</span><small>{string(item.entity_type)}</small></button>)}</div>}
  </div>
}
function inputDate(value: unknown, datetime: boolean): string {
  if (!value) return ''
  const date = new Date(string(value))
  if (Number.isNaN(date.getTime())) return ''
  return datetime ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : date.toISOString().slice(0, 10)
}
export function FieldInput({ field, data, onChange, user, disabled = false }: { field: Field; data: Data; onChange: (next: Data) => void; user: User; disabled?: boolean }) {
  const id = useId(), value = get(data, field.path)
  const update = (value: unknown) => onChange(set(data, field.path, value))
  const common = { id, disabled, required: field.required }
  const kind = field.kind || 'text'
  if (kind === 'checkbox') return <label className="checkbox-field"><input {...common} type="checkbox" checked={!!value} onChange={event => update(event.target.checked)} /><span>{field.label}</span></label>
  return <div className={`field ${field.wide || kind === 'textarea' ? 'field-wide' : ''}`}><label htmlFor={id}>{field.label}{field.required && <span className="required"> *</span>}</label>
    {kind === 'entity' ? <EntityPicker id={id} value={string(value)} onChange={update} user={user} required={field.required} />
      : kind === 'textarea' ? <textarea {...common} rows={4} value={string(value)} onChange={event => update(event.target.value)} />
      : kind === 'select' ? <select {...common} value={string(value)} onChange={event => update(event.target.value)}><option value="">Sélectionner…</option>{[...new Set([...(field.options || []), ...(value ? [string(value)] : [])])].map(option => <option key={option}>{option}</option>)}</select>
      : <input {...common} type={kind === 'csv' ? 'text' : kind} value={kind === 'date' || kind === 'datetime-local' ? inputDate(value, kind === 'datetime-local') : string(value)} min={field.min} max={field.max} step={kind === 'number' ? 'any' : undefined} onChange={event => update(kind === 'csv' ? event.target.value : event.target.value)} />}
  </div>
}
export function ArrayFields({ definition, data, onChange, user, disabled }: { definition: Collection; data: Data; onChange: (next: Data) => void; user: User; disabled?: boolean }) {
  const values = rows(get(data, definition.path))
  const update = (values: Data[]) => onChange(set(data, definition.path, values))
  return <section className="form-section"><div className="section-heading"><div><h2>{definition.title}</h2><p>{values.length} élément{values.length > 1 ? 's' : ''}</p></div><button className="button secondary small" type="button" disabled={disabled} onClick={() => update([...values, structuredClone(definition.defaults || {})])}><Icon name="plus" size={16} />Ajouter</button></div>
    {!values.length && <p className="muted">Aucun élément ajouté.</p>}{values.map((value, index) => <div className="array-row" key={index}><div className="array-row-heading"><strong>Élément {index + 1}</strong><button className="icon-button danger-text" type="button" aria-label={`Retirer l’élément ${index + 1}`} disabled={disabled} onClick={() => update(values.filter((_, i) => i !== index))}><Icon name="trash" size={17} /></button></div><div className="form-grid">{definition.fields.map(field => <FieldInput key={field.path} field={field} data={asData(value)} user={user} disabled={disabled} onChange={next => update(values.map((row, i) => i === index ? next : row))} />)}</div></div>)}
  </section>
}
