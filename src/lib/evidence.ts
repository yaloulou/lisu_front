export const MAX_FILES = 20
export const MAX_BYTES = 100 * 1024 * 1024
export const formats = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
  video: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac'],
  document: ['pdf', 'txt', 'csv', 'rtf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'],
}
export const fileType = (file: File): string | undefined => Object.entries(formats).find(([, extensions]) => extensions.includes(file.name.split('.').pop()?.toLowerCase() || ''))?.[0]
export const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`
export function selectFiles(files: File[], existing: number, pending: File[]): { pending: File[]; error: string } {
  const next = [...pending]; let error = ''
  for (const file of files) {
    if (!fileType(file)) { error = `Format non accepté : ${file.name}`; continue }
    if (!file.size || file.size > MAX_BYTES) { error = `${file.name} : fichier vide ou supérieur à 100 Mo.`; continue }
    if (next.some(item => fileKey(item) === fileKey(file))) continue
    if (existing + next.length >= MAX_FILES) { error = '20 pièces jointes maximum par dossier.'; break }
    next.push(file)
  }
  return { pending: next, error }
}
