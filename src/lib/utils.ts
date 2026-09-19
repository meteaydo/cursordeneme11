import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Her kelimenin ilk harfini büyük yapar
 */
export function formatTitleCase(str: string): string {
  return str
    .toLocaleLowerCase('tr-TR')
    .split(' ')
    .map((word) => word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1))
    .join(' ')
}

/**
 * Sınıf adını formatlar (Örn: "9 a" -> "9A", "10-B" -> "10B")
 */
export function formatClassName(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

/** PC22, 22 ve PC07 / 7 aynı numara sayılsın */
export function pcNoKey(value: string): string {
  const key = formatClassName(value).replace(/^PC/, '')
  if (/^\d+$/.test(key)) {
    const trimmed = key.replace(/^0+/, '')
    return trimmed || '0'
  }
  return key
}

export function samePcNo(a?: string, b?: string): boolean {
  const ka = pcNoKey(a || '')
  const kb = pcNoKey(b || '')
  return ka !== '' && ka === kb
}

export function dedupeEskiPcNolari(list: string[], extra?: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of extra ? [...list, extra] : list) {
    const value = (raw || '').trim()
    const key = pcNoKey(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

/** Aktif PC numarasını eski listeden çıkar; yalnızca gerçekten değiştirilmiş numaralar kalır */
export function eskiPcNolariForDisplay(currentPc: string | undefined, list: string[]): string[] {
  return dedupeEskiPcNolari(list).filter((p) => !samePcNo(p, currentPc || ''))
}

const CLASS_COLORS = [
  'border-l-red-500',
  'border-l-orange-500',
  'border-l-amber-500',
  'border-l-green-500',
  'border-l-emerald-500',
  'border-l-teal-500',
  'border-l-cyan-500',
  'border-l-sky-500',
  'border-l-blue-500',
  'border-l-indigo-500',
  'border-l-violet-500',
  'border-l-purple-500',
  'border-l-fuchsia-500',
  'border-l-pink-500',
  'border-l-rose-500',
]

export function getClassColor(className: string) {
  if (!className) return 'border-l-primary'
  let hash = 0
  for (let i = 0; i < className.length; i++) {
    hash = className.charCodeAt(i) + ((hash << 5) - hash)
  }
  return CLASS_COLORS[Math.abs(hash) % CLASS_COLORS.length]
}

/** Uygulama kanıt fotoğrafı üst sınırı */
export const MAX_UYGULAMA_FOTO = 3

export function getScoreKameraFotolar(
  score?: { kameraFoto?: string; kameraFotolar?: string[] } | null,
): string[] {
  if (!score) return []
  if (score.kameraFotolar?.length) {
    return score.kameraFotolar.filter(Boolean).slice(0, MAX_UYGULAMA_FOTO)
  }
  if (score.kameraFoto) return [score.kameraFoto]
  return []
}
