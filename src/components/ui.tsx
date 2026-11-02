import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const paths: Record<string, string> = {
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  entities: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m14-13a4 4 0 0 1 0 8m6 5v-2a4 4 0 0 0-3-3M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  calendar: 'M4 5h16v16H4V5Zm3-3v6m10-6v6M4 10h16m-12 5h3m3 0h3',
  network: 'M9 3h6v5H9V3ZM2 16h6v5H2v-5Zm14 0h6v5h-6v-5ZM12 8v4M5 16v-4h14v4',
  chart: 'M4 3v17h17M8 16v-5m5 5V6m5 10V9',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
  search: 'm21 21-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
  plus: 'M12 5v14M5 12h14', close: 'm6 6 12 12M6 18 18 6',
  edit: 'm16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  arrow: 'M5 12h14m-6-6 6 6-6 6', back: 'M19 12H5m6-6-6 6 6 6',
  logout: 'M9 4H4v16h5m5-12 4 4-4 4m-6-4h10',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6',
  check: 'm5 12 4 4L19 6', file: 'M14 2H5v20h14V7l-5-5Zm0 0v5h5M8 12h8m-8 4h8',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  lock: 'M5 10h14v11H5V10Zm3 0V6a4 4 0 0 1 8 0v4m-4 5v2',
  menu: 'M3 6h18M3 12h18M3 18h18', pin: 'M12 22s7-7 7-13A7 7 0 0 0 5 9c0 6 7 13 7 13Zm0-16a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  info: 'M12 8h.01M12 11v6M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
}
export function Icon({ name, size = 20 }: { name: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.file} /></svg> }
export function Brand({ href, onClick }: { href: string; onClick?: () => void }) {
  return <a className="brand" href={href} onClick={onClick}><span className="brand-mark" aria-hidden="true">L</span><span>LISU</span></a>
}
export function Spinner() { return <span className="spinner" aria-label="Chargement" /> }
export function Loading({ text = 'Chargement des données…' }: { text?: string }) { return <div className="loading"><Spinner /><span>{text}</span></div> }
export function Alert({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div role={error ? 'alert' : 'status'} className={`alert ${error ? 'alert-error' : ''}`}><Icon name="info" /><div>{children}</div></div> }
export function Empty({ title = 'Aucun résultat', children }: { title?: string; children?: ReactNode }) { return <div className="empty"><span className="empty-icon"><Icon name="search" size={28} /></span><h3>{title}</h3><p>{children || 'Modifiez vos filtres ou ajoutez un nouvel enregistrement.'}</p></div> }
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span> }
export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</header>
}
export function Modal({ title, children, onClose, busy = false, large = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; large?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current; if (dialog?.showModal) dialog.showModal(); else dialog?.setAttribute('open', ''); return () => dialog?.close?.() }, [])
  return <dialog ref={ref} className={`modal ${large ? 'modal-large' : ''}`} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Fermer"><Icon name="close" /></button></header>{children}
  </dialog>
}
export function Confirm({ title, children, onConfirm, onClose }: { title: string; children: ReactNode; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function confirm() { setBusy(true); setError(''); try { await onConfirm(); onClose() } catch (error) { setError(error instanceof Error ? error.message : 'Échec de l’opération') } finally { setBusy(false) } }
  return <Modal title={title} onClose={onClose} busy={busy}><div className="modal-body">{children}{error && <Alert error>{error}</Alert>}</div><footer className="modal-actions"><button className="button secondary" onClick={onClose} disabled={busy}>Annuler</button><button className="button danger" onClick={confirm} disabled={busy}>{busy ? <Spinner /> : <Icon name="trash" />}Confirmer</button></footer></Modal>
}
interface Toast { id: number; text: string; kind: string }
export function Toasts() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    function receive(event: Event) {
      const item = { ...(event as CustomEvent).detail, id: Date.now() + Math.random() } as Toast
      setItems(items => [...items, item])
      const timer = setTimeout(() => { setItems(items => items.filter(value => value.id !== item.id)); timers.delete(timer) }, 6500)
      timers.add(timer)
    }
    window.addEventListener('intel-notification', receive)
    return () => { window.removeEventListener('intel-notification', receive); timers.forEach(clearTimeout) }
  }, [])
  return <div className="toast-stack" aria-live="polite">{items.map(item => <div className={`toast ${item.kind}`} key={item.id}><Icon name={item.kind === 'success' ? 'check' : 'info'} /><span>{item.text}</span><button className="icon-button" aria-label="Fermer la notification" onClick={() => setItems(items => items.filter(value => value.id !== item.id))}><Icon name="close" size={16} /></button></div>)}</div>
}
