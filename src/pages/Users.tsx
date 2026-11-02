import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../lib/api'
import { refreshProfile } from '../lib/auth'
import { list, message, notify, roles, string } from '../lib/data'
import type { Data, Role, User } from '../lib/data'
import { useRemote } from '../lib/hooks'
import { Alert, Badge, Confirm, Empty, Icon, Loading, Modal, PageHeader, Spinner } from '../components/ui'

export function Users({ user }: { user: User }) {
  const result = useRemote(useCallback((signal: AbortSignal) => api<unknown>('/users', { signal }).then(list), []))
  const [editing, setEditing] = useState<Data | null | undefined>(), [passwordUser, setPasswordUser] = useState<Data | null>(null), [deactivate, setDeactivate] = useState<Data | null>(null)
  const [search, setSearch] = useState('')
  const items = (result.value?.items || []).filter(item => [item.nom, item.prenom, item.email, item.role, item.desk].some(value => string(value).toLowerCase().includes(search.toLowerCase())))
  const desks = [...new Set(['cord_intel', 'CCOC', ...(result.value?.items || []).map(item => string(item.desk)).filter(Boolean)])]
  return <><PageHeader title="Gestion des utilisateurs" description="Administrer les comptes, les rôles et les affectations aux desks." actions={<button className="button primary" onClick={() => setEditing(null)}><Icon name="plus" />Nouvel utilisateur</button>} />
    <section className="panel"><div className="filters"><label className="search-field"><Icon name="search" /><input aria-label="Rechercher un utilisateur" placeholder="Nom, email, rôle ou desk…" value={search} onChange={event => setSearch(event.target.value)} /></label><button className="button secondary" onClick={result.reload} disabled={result.loading}><Icon name="refresh" />Actualiser</button></div><div className="table-toolbar"><span><strong>{items.length}</strong> compte{items.length > 1 ? 's' : ''}</span><Badge>Administration</Badge></div>
    {result.loading ? <Loading /> : result.error ? <div className="panel-padding"><Alert error>{result.error}</Alert></div> : !items.length ? <Empty /> : <div className="table-scroll"><table><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Desk</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{items.map(item => <tr key={string(item._id)}><td><div className="user-cell"><span className="avatar">{string(item.prenom || item.email).slice(0, 1).toUpperCase()}</span><div><strong>{[item.prenom, item.nom].map(string).filter(Boolean).join(' ') || string(item.email)}</strong><small>{string(item.email)}</small></div>{item._id === user._id && <Badge>Vous</Badge>}</div></td><td><Badge tone={item.role === 'admin' ? 'blue' : ''}>{string(item.role)}</Badge></td><td>{string(item.desk) || '—'}</td><td><Badge tone={item.actif ? 'green' : ''}>{item.actif ? 'Actif' : 'Désactivé'}</Badge></td><td><div className="row-actions"><button className="button quiet small" onClick={() => setEditing(item)}><Icon name="edit" size={15} />Modifier</button><button className="icon-button" title="Changer le mot de passe" aria-label={`Changer le mot de passe de ${string(item.email)}`} onClick={() => setPasswordUser(item)}><Icon name="lock" size={17} /></button><button className="button quiet small danger-text" disabled={!item.actif} onClick={() => setDeactivate(item)}>Désactiver</button></div></td></tr>)}</tbody></table></div>}
    </section>
    {editing !== undefined && <UserForm initial={editing} desks={desks} onClose={() => setEditing(undefined)} onSaved={async id => { setEditing(undefined); result.reload(); if (id === user._id) await refreshProfile() }} />}
    {passwordUser && <PasswordForm user={passwordUser} onClose={() => setPasswordUser(null)} />}
    {deactivate && <Confirm title="Désactiver ce compte ?" onClose={() => setDeactivate(null)} onConfirm={async () => { await api(`/users/${encodeURIComponent(string(deactivate._id))}/desactiver`, { method: 'PATCH' }); notify('Compte désactivé.'); result.reload(); if (deactivate._id === user._id) await refreshProfile() }}><p>Le compte <strong>{string(deactivate.email)}</strong> ne pourra plus accéder à l’application.</p></Confirm>}
  </>
}
function UserForm({ initial, desks, onClose, onSaved }: { initial: Data | null; desks: string[]; onClose: () => void; onSaved: (id: string) => Promise<void> }) {
  const [form, setForm] = useState(() => ({ nom: string(initial?.nom), prenom: string(initial?.prenom), email: string(initial?.email), password: '', role: (initial?.role || 'analyste') as Role, desk: string(initial?.desk), actif: initial ? !!initial.actif : true }))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError('')
    try {
      const { password, ...profile } = form
      const result = await api<User>(initial ? `/users/${encodeURIComponent(string(initial._id))}` : '/users', { method: initial ? 'PUT' : 'POST', body: { ...profile, email: profile.email.trim().toLowerCase(), desk: profile.desk.trim(), ...(!initial ? { password } : {}) } })
      notify(initial ? 'Compte mis à jour.' : 'Utilisateur créé.'); await onSaved(result._id)
    } catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  return <Modal title={initial ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'} onClose={onClose} busy={busy}><form onSubmit={save}><div className="modal-body">{error && <Alert error>{error}</Alert>}<fieldset disabled={busy}><div className="form-grid">
    <label className="field">Nom<input value={form.nom} onChange={event => setForm({ ...form, nom: event.target.value })} autoComplete="family-name" /></label><label className="field">Prénom<input value={form.prenom} onChange={event => setForm({ ...form, prenom: event.target.value })} autoComplete="given-name" /></label>
    <label className="field field-wide">Adresse email *<input type="email" value={form.email} required disabled={!!initial} onChange={event => setForm({ ...form, email: event.target.value })} autoComplete="email" /></label>
    {!initial && <label className="field field-wide">Mot de passe *<input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /><small>Au moins 8 caractères.</small></label>}
    <label className="field">Rôle *<select required value={form.role} onChange={event => setForm({ ...form, role: event.target.value as Role })}>{roles.map(role => <option key={role}>{role}</option>)}</select></label>
    <label className="field">Desk<input list="user-desk-options" value={form.desk} onChange={event => setForm({ ...form, desk: event.target.value })} placeholder="Choisir ou saisir un nouveau desk" autoComplete="off" /><datalist id="user-desk-options">{desks.map(desk => <option value={desk} key={desk} />)}</datalist></label>
    <p className="field-wide muted form-hint">cord_intel : contrôle et distribution des informations. Un desk destinataire devient sélectionnable dès qu’un analyste ou conseiller actif lui est affecté.</p>
    {initial && <label className="checkbox-field"><input type="checkbox" checked={form.actif} onChange={event => setForm({ ...form, actif: event.target.checked })} />Compte actif</label>}
    </div></fieldset></div><footer className="modal-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>Annuler</button><button className="button primary" disabled={busy}>{busy ? <Spinner /> : <Icon name="check" />}Enregistrer</button></footer></form></Modal>
}
function PasswordForm({ user, onClose }: { user: Data; onClose: () => void }) {
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault(); if (password !== confirmation) { setError('Les mots de passe ne correspondent pas.'); return }
    setBusy(true); setError('')
    try { await api(`/users/${encodeURIComponent(string(user._id))}/password`, { method: 'PATCH', body: { password } }); notify('Mot de passe modifié.'); onClose() }
    catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  return <Modal title="Changer le mot de passe" onClose={onClose} busy={busy}><form onSubmit={save}><div className="modal-body"><p className="muted">Compte : {string(user.email)}</p>{error && <Alert error>{error}</Alert>}<div className="form-grid"><label className="field field-wide">Nouveau mot de passe<input type="password" required minLength={8} autoComplete="new-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label><label className="field field-wide">Confirmer le mot de passe<input type="password" required autoComplete="new-password" value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></label></div></div><footer className="modal-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>Annuler</button><button className="button primary" disabled={busy}>{busy ? <Spinner /> : <Icon name="lock" />}Modifier le mot de passe</button></footer></form></Modal>
}
