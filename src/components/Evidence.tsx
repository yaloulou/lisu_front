import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { api, evidencePath, upload } from '../lib/api'
import { asData, message, string } from '../lib/data'
import type { Data, EvidenceRef } from '../lib/data'
import { Alert, Icon, Modal, Spinner } from './ui'
import { fileType, fileKey, formats, MAX_FILES, selectFiles } from '../lib/evidence'
const labels: Record<string, string> = { image: 'Image', video: 'Vidéo', audio: 'Audio', document: 'Document' }
export interface EvidenceHandle { uploadAll: (classification?: unknown) => Promise<EvidenceRef[]> }
interface Props { value: EvidenceRef[]; onChange?: (refs: EvidenceRef[]) => void; context: 'observations' | 'events'; recordId?: string; readonly?: boolean; disabled?: boolean }
export const Evidence = forwardRef<EvidenceHandle, Props>(function Evidence({ value, onChange, context, recordId, readonly = false, disabled = false }, ref) {
  const [pending, setPending] = useState<File[]>([]), [metadata, setMetadata] = useState<Record<string, Data>>({})
  const [error, setError] = useState(''), [uploading, setUploading] = useState(false), [progress, setProgress] = useState(0), [uploadName, setUploadName] = useState('')
  const [loadingFile, setLoadingFile] = useState(''), [preview, setPreview] = useState<{ url: string; type: string; title: string } | null>(null), [previewError, setPreviewError] = useState(false)
  const sending = useRef(false)
  const signature = JSON.stringify(value.map(item => item.doc_id))
  useEffect(() => {
    const controller = new AbortController()
    const ids = JSON.parse(signature) as string[]
    void Promise.all(ids.map(async id => {
      try { const document = await api(evidencePath(id, context, recordId), { signal: controller.signal }); if (!controller.signal.aborted) setMetadata(previous => ({ ...previous, [id]: document })) }
      catch (error) { if (!controller.signal.aborted) setMetadata(previous => ({ ...previous, [id]: { title: id, error: message(error) } })) }
    }))
    return () => controller.abort()
  }, [signature, context, recordId])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])
  useImperativeHandle(ref, () => ({
    async uploadAll(classification?: unknown) {
      if (sending.current) throw new Error('Un envoi est déjà en cours.')
      sending.current = true; setUploading(true); setError('')
      const refs = value.map(item => ({ ...item }))
      try {
        for (const file of pending) {
          setUploadName(file.name); setProgress(0)
          const form = new FormData()
          form.append('file', file); form.append('context', context); form.append('classification', JSON.stringify(classification || { level: 'OUVERT', compartments: [] }))
          const result = await upload('/api/uploads/evidence', form, setProgress)
          const evidence = asData(result.evidence) as unknown as EvidenceRef
          if (!evidence.doc_id) throw new Error('Le serveur n’a pas retourné la référence du fichier.')
          refs.push(evidence)
          setMetadata(previous => ({ ...previous, [evidence.doc_id]: asData(result.document) }))
          setPending(previous => previous.filter(item => fileKey(item) !== fileKey(file)))
          onChange?.([...refs])
        }
        return refs
      } catch (error) { setError(message(error)); throw error }
      finally { sending.current = false; setUploading(false); setUploadName('') }
    },
  }), [value, pending, context, onChange])
  const busy = disabled || uploading
  async function read(item: EvidenceRef, download: boolean) {
    setLoadingFile(item.doc_id); setError('')
    try {
      const blob = await api<Blob>(evidencePath(item.doc_id, context, recordId, true), { blob: true })
      const url = URL.createObjectURL(blob), title = string(metadata[item.doc_id]?.title) || item.doc_id
      if (download) { const anchor = document.createElement('a'); anchor.href = url; anchor.download = title; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
      else { setPreviewError(false); setPreview({ url, type: item.type || blob.type.split('/')[0], title }) }
    } catch (error) { setError(message(error)) } finally { setLoadingFile('') }
  }
  return <section className="form-section evidence-section"><div className="section-heading"><div><h2>Pièces jointes</h2><p>Images, vidéos, audios et documents</p></div><span className="count-pill">{value.length + pending.length} / {MAX_FILES}</span></div>
    {error && <Alert error>{error}</Alert>}
    {!readonly && <label className={`file-drop ${busy ? 'disabled' : ''}`}><Icon name="upload" size={26} /><strong>Ajouter des pièces jointes</strong><span>Plusieurs sélections possibles · 100 Mo maximum par fichier</span><input type="file" aria-label="Ajouter des pièces jointes" multiple accept={Object.values(formats).flat().map(value => '.' + value).join(',')} disabled={busy} onChange={event => { const result = selectFiles(Array.from(event.target.files || []), value.length, pending); setPending(result.pending); setError(result.error); event.target.value = '' }} /></label>}
    {uploading && <div className="upload-progress" aria-live="polite"><p>Envoi de {uploadName} <strong>{progress} %</strong></p><progress max={100} value={progress} /></div>}
    {!value.length && !pending.length && <p className="muted">Aucune pièce jointe.</p>}
    <div className="attachment-list">{value.map(item => <div className="attachment" key={item.doc_id}><span className="file-icon"><Icon name="file" /></span><div className="attachment-name"><strong>{string(metadata[item.doc_id]?.title) || item.doc_id}</strong><small>{labels[item.type || ''] || 'Fichier'} · {metadata[item.doc_id] ? metadata[item.doc_id].error ? 'Accès indisponible' : 'Enregistré' : 'Chargement…'}</small></div><div className="row-actions">{loadingFile === item.doc_id ? <Spinner /> : <>
      {item.type !== 'document' && <button type="button" className="icon-button" disabled={busy} aria-label="Consulter la pièce jointe" onClick={() => void read(item, false)}><Icon name="eye" /></button>}
      <button type="button" className="icon-button" disabled={busy} aria-label="Télécharger la pièce jointe" onClick={() => void read(item, true)}><Icon name="download" /></button></>}
      {!readonly && <button type="button" className="icon-button danger-text" disabled={busy} aria-label="Retirer la pièce jointe" onClick={() => onChange?.(value.filter(ref => ref.doc_id !== item.doc_id))}><Icon name="close" /></button>}
    </div></div>)}
      {pending.map(file => <div className="attachment" key={fileKey(file)}><span className="file-icon pending"><Icon name="file" /></span><div className="attachment-name"><strong>{file.name}</strong><small>{labels[fileType(file) || '']} · {(file.size / 1048576).toFixed(1)} Mo · En attente</small></div><button type="button" className="icon-button" disabled={busy} aria-label={`Retirer ${file.name}`} onClick={() => setPending(pending => pending.filter(item => item !== file))}><Icon name="close" /></button></div>)}
    </div>
    {preview && <Modal title={preview.title} onClose={() => setPreview(null)} large><div className="modal-body media-preview">{previewError && <Alert>Ce format n’est pas lisible dans le navigateur. Téléchargez le fichier pour l’ouvrir.</Alert>}{preview.type === 'image' ? <img src={preview.url} alt={preview.title} onError={() => setPreviewError(true)} /> : preview.type === 'video' ? <video controls src={preview.url} onError={() => setPreviewError(true)} /> : preview.type === 'audio' ? <audio controls src={preview.url} onError={() => setPreviewError(true)} /> : <Alert>Téléchargez ce document pour le consulter.</Alert>}</div></Modal>}
  </section>
})
