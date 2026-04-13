import { useState, useEffect } from 'react'

export interface ToastData {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive' | 'blue'
}

let toastCount = 0
let memoryState: ToastData[] = []
const listeners: Array<(state: ToastData[]) => void> = []

function dispatch(action: ToastData[]) {
  memoryState = action
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}
//
export function toast({ title, description, variant = 'default' }: Omit<ToastData, 'id'>) {
  const id = String(++toastCount)
  dispatch([...memoryState, { id, title, description, variant }])
  setTimeout(() => {
    dispatch(memoryState.filter((t) => t.id !== id))
  }, 2000)
}

export function dismiss(id: string) {
  dispatch(memoryState.filter((t) => t.id !== id))
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>(memoryState)

  useEffect(() => {
    listeners.push(setToasts)
    return () => {
      const index = listeners.indexOf(setToasts)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [])

  return { toasts, toast, dismiss }
}
