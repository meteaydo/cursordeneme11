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
