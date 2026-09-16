export function getAcademicYear(date = new Date()): string {
  const y = date.getFullYear()
  const m = date.getMonth()
  if (m >= 8) return `${y}-${y + 1}`
  return `${y - 1}-${y}`
}

export function academicYearOptions(extra: string[] = []): string[] {
  const current = getAcademicYear()
  const start = Number(current.split('-')[0])
  const years = new Set(extra.filter(Boolean))
  for (let i = -2; i <= 1; i++) {
    const a = start + i
    years.add(`${a}-${a + 1}`)
  }
  return [...years].sort((a, b) => b.localeCompare(a, 'tr', { numeric: true }))
}