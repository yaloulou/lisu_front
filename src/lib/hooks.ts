import { useEffect, useState } from 'react'
import { message } from './data'
export function useRemote<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [value, setValue] = useState<T | undefined>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    Promise.resolve().then(async () => {
      if (controller.signal.aborted) return
      setLoading(true); setError('')
      try { const result = await loader(controller.signal); if (!controller.signal.aborted) setValue(result) }
      catch (error) { if (!controller.signal.aborted) setError(message(error)) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })
    return () => controller.abort()
  }, [loader, revision])
  return { value, error, loading, reload: () => setRevision(value => value + 1) }
}
