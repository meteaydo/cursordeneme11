import { useMemo, useState } from 'react'
import Fuse from 'fuse.js'

export type FuseStudentSearchRow = {
  adSoyad: string
  no: string
  pcNo?: string
}

const FUSE_OPTIONS = {
  keys: [
    { name: 'adSoyad', weight: 0.6 },
    { name: 'no', weight: 0.25 },
    { name: 'pcNo', weight: 0.15 },
  ],
  threshold: 0.4,
  includeScore: true,
}

/** Ders detayı ve yoklama sayfalarındaki akıllı öğrenci araması (Fuse.js). */
export function useFuseStudentSearch<T extends FuseStudentSearchRow>(items: T[]) {
  const [query, setQuery] = useState('')
  const fuse = useMemo(() => new Fuse(items, FUSE_OPTIONS), [items])
  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return items
    return fuse.search(q).map((r) => r.item)
  }, [items, query, fuse])

  return { query, setQuery, filtered }
}
