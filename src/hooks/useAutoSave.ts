import { useEffect, useRef, useState } from 'react'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'offline-saved' | 'error'

const DEBOUNCE_MS = 800
const SAVED_DISPLAY_MS = 1000

export function useAutoSave<T>(
  data: T | null,
  saveFn: (data: T) => Promise<void>,
) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<T | null>(null)
  const isFirstMount = useRef(true)
  const saveFnRef = useRef(saveFn)

  useEffect(() => {
    saveFnRef.current = saveFn
  }, [saveFn])

  const flush = async (value: T) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingRef.current = null
    setStatus('saving')
    try {
      await saveFnRef.current(value)
      if (!navigator.onLine) {
        setStatus('offline-saved')
      } else {
        setStatus('saved')
        setTimeout(() => setStatus('idle'), SAVED_DISPLAY_MS)
      }
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => {
    if (data === null) return

    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }

    pendingRef.current = data

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      flush(data)
    }, DEBOUNCE_MS)
  }, [data])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      if (pendingRef.current !== null) {
        saveFnRef.current(pendingRef.current).catch(() => {})
      }
    }
  }, []) // Empty dependency array -> runs only on unmount

  return { status }
}
