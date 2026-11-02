import { useState } from 'react'
import type { FormEvent } from 'react'
import { login } from '../lib/auth'
import { canCcoc, message } from '../lib/data'
import { navigate } from '../lib/router'
import { Alert, Brand, Icon, Spinner } from '../components/ui'

export function Login() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [visible, setVisible] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError('')
    const requested = window.location.hash.slice(1)
    try { const user = await login(email, password); navigate(requested.startsWith('/') && requested !== '/login' && requested !== '/' ? requested : canCcoc(user) ? '/board' : '/observations') }
    catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  return <main className="login-page">
    <header className="login-header"><Brand href="#/login" /></header>
    <section className="login-content">
      <form className="login-form" onSubmit={submit}>
        <h1>Connexion</h1>
        <p className="muted">Identifiez-vous pour accéder à LISU.</p>
        {error && <Alert error>{error}</Alert>}
        <label className="field">Adresse email
          <input type="email" autoComplete="username" autoFocus required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} placeholder="prenom.nom@organisation.cd" />
        </label>
        <label className="field">Mot de passe
          <div className="password-input">
            <input type={visible ? 'text' : 'password'} required autoComplete="current-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} placeholder="Votre mot de passe" />
            <button type="button" className="icon-button" aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setVisible(!visible)}><Icon name="eye" size={18} /></button>
          </div>
        </label>
        <button className="button primary login-submit" disabled={busy}>{busy && <Spinner />}{busy ? 'Connexion…' : 'Se connecter'}</button>
        <p className="login-help">Pour obtenir un accès, contactez votre administrateur.</p>
      </form>
    </section>
    <footer className="login-version"><Icon name="lock" size={13} />Accès réservé aux utilisateurs autorisés</footer>
  </main>
}
