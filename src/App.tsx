import { useEffect, useState } from 'react'
import { logout, refreshProfile, useSession } from './lib/auth'
import { canCcoc, canCreate, canEdit, canRead, canReview } from './lib/data'
import type { Resource, User } from './lib/data'
import { navigate, useRoute } from './lib/router'
import { configs } from './lib/resources'
import { Alert, Brand, Icon, Loading, Toasts } from './components/ui'
import { Login } from './pages/Login'
import { RecordDetail, RecordEditor, RecordList } from './pages/Records'
import { Users } from './pages/Users'
import { Dashboard } from './pages/Dashboard'
import { MapPage } from './pages/Map'

interface NavItem { path: string; label: string; icon: string }
function Forbidden() { return <div className="access-page"><span className="empty-icon"><Icon name="lock" size={32} /></span><span className="eyebrow">Accès restreint</span><h1>Cette page n’est pas accessible</h1><p>Votre rôle ou votre affectation au desk ne permet pas cette action.</p><button className="button primary" onClick={() => navigate('/observations')}>Revenir aux informations</button></div> }
function Content({ route, user }: { route: string; user: User }) {
  const [path, query = ''] = route.split('?')
  if (path === '/403') return <Forbidden />
  if (path === '/admin/users') return user.role === 'admin' ? <Users user={user} /> : <Forbidden />
  if (path === '/board') return canCcoc(user) ? <Dashboard /> : <Forbidden />
  if (path === '/dashboard') return canCcoc(user) ? <RecordEditor resource="intel" user={user} /> : <Forbidden />
  if (path === '/mapdiplo') return <MapPage user={user} initialSource={new URLSearchParams(query).get('source') || undefined} />
  if (path.startsWith('/profile/') || path.startsWith('/incident/')) {
    const resource = path.startsWith('/profile/') ? 'entities' : 'intel'
    if (!canRead(user, resource)) return <Forbidden />
    let id: string
    try { id = decodeURIComponent(path.slice(path.startsWith('/profile/') ? 9 : 10)) } catch { return <Alert error>Identifiant invalide.</Alert> }
    return <RecordDetail resource={resource} id={id} user={user} />
  }
  const aliases: Record<string, string> = { '/entities': '/poldiplo', '/events': '/extra/events', '/relations': '/extra/links', '/intel': '/search', '/searchpoldiplo': '/poldiplo' }
  const normalized = aliases[path] || path
  for (const resource of Object.keys(configs) as Resource[]) {
    const config = configs[resource]
    if (normalized !== config.path && !normalized.startsWith(config.path + '/')) continue
    if (!canRead(user, resource)) return <Forbidden />
    const suffix = normalized.slice(config.path.length).split('/').filter(Boolean)
    if (!suffix.length) return <RecordList resource={resource} user={user} />
    if (suffix[0] === 'new' && suffix.length === 1) return canCreate(user, resource) ? <RecordEditor resource={resource} user={user} /> : <Forbidden />
    let id: string
    try { id = decodeURIComponent(suffix[0]) } catch { return <Alert error>L’identifiant dans l’adresse est invalide.</Alert> }
    if (suffix[1] === 'edit' && suffix.length === 2) return canEdit(user, resource) ? <RecordEditor resource={resource} id={id} user={user} /> : <Forbidden />
    if (suffix.length === 1) return <RecordDetail resource={resource} id={id} user={user} />
  }
  return <div className="access-page"><h1>Page introuvable</h1><p>Cette adresse ne correspond à aucune page.</p><button className="button primary" onClick={() => navigate('/observations')}>Retour à l’espace de travail</button></div>
}
function Workspace({ user, route }: { user: User; route: string }) {
  const [menu, setMenu] = useState(false)
  const ccoc = canCcoc(user)
  const main: NavItem[] = [
    { path: '/observations', label: 'Informations', icon: 'eye' },
    ...(canRead(user, 'entities') ? [{ path: '/poldiplo', label: 'Entités', icon: 'entities' }] : []),
    ...(canRead(user, 'events') ? [{ path: '/extra/events', label: 'Renseignements', icon: 'calendar' }] : []),
    ...(canRead(user, 'links') ? [{ path: '/extra/links', label: 'Relations', icon: 'network' }] : []),
    { path: '/mapdiplo', label: 'Cartographie', icon: 'map' },
  ]
  const ccocItems: NavItem[] = [{ path: '/board', label: 'Tableau de bord', icon: 'chart' }, { path: '/dashboard', label: 'Enregistrer CCOC', icon: 'plus' }, { path: '/search', label: 'Rechercher CCOC', icon: 'search' }]
  const all = [...main, ...ccocItems, { path: '/admin/users', label: 'Gestion utilisateurs', icon: 'entities' }]
  const current = all.find(item => route === item.path || route.startsWith(item.path + '/') || route.startsWith(item.path + '?'))?.label || 'Détail de l’enregistrement'
  const name = [user.prenom, user.nom].filter(Boolean).join(' ') || user.email
  const nav = (items: NavItem[]) => items.map(item => <a key={item.path} href={`#${item.path}`} className={route === item.path || route.startsWith(item.path + '/') || route.startsWith(item.path + '?') ? 'nav-item active' : 'nav-item'} onClick={() => setMenu(false)}><Icon name={item.icon} size={18} /><span>{item.label}</span></a>)
  return <div className="workspace">{menu && <button className="sidebar-overlay" aria-label="Fermer le menu" onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? 'open' : ''}`}><Brand href={`#${ccoc ? '/board' : '/observations'}`} onClick={() => setMenu(false)} /><nav aria-label="Navigation principale"><span className="nav-group">Espace de travail</span>{nav(main)}{ccoc && <><span className="nav-group">CCOC</span>{nav(ccocItems)}</>}{user.role === 'admin' && <><span className="nav-group">Administration</span>{nav([{ path: '/admin/users', label: 'Gestion utilisateurs', icon: 'entities' }])}</>}</nav><div className="sidebar-bottom">{canReview(user) && <div className="reviewer-note"><Icon name="check" size={17} /><span>Validation des informations</span></div>}<div className="sidebar-user"><span className="avatar">{name.slice(0, 1).toUpperCase()}</span><div><strong>{name}</strong><span>{user.role}{user.desk ? ` · ${user.desk}` : ''}</span></div><button className="icon-button" onClick={() => { logout(); navigate('/login') }} aria-label="Se déconnecter" title="Se déconnecter"><Icon name="logout" size={19} /></button></div></div></aside>
    <div className="workspace-main"><header className="topbar"><div className="row-actions"><button className="icon-button menu-toggle" aria-label="Ouvrir le menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="menu" /></button><span className="breadcrumb-root">Espace de travail</span><span className="breadcrumb-separator">/</span><strong>{current}</strong></div><div className="topbar-right"><span className="today">{new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span><span className="session-dot" title="Session authentifiée" /><span className="avatar small">{name.slice(0, 1).toUpperCase()}</span></div></header><main className="content" id="main-content" tabIndex={-1}><Content route={route} user={user} key={`${user._id}:${user.role}:${user.desk}:${route}`} /></main><footer className="workspace-footer"><span>LISU</span><span>Espace de travail</span></footer></div>
  </div>
}
export default function App() {
  const { user, loading } = useSession(), route = useRoute()
  useEffect(() => { const refresh = () => { if (user) void refreshProfile().catch(() => undefined) }; window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh) }, [user])
  if (loading) return <><div className="boot-screen"><span className="brand-mark" aria-hidden="true">L</span><Loading text="Ouverture de votre espace…" /></div><Toasts /></>
  const current = route === '/' || route === '/login' ? canCcoc(user) ? '/board' : '/observations' : route
  return <><a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Aller au contenu</a>{user ? <Workspace user={user} route={current} /> : <Login />}<Toasts /></>
}
