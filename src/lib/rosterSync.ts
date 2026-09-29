import type { ParsedStudent } from '@/lib/excelStudentParser'

export type RosterSyncMember = {
  id: string
  no: string
  adSoyad: string
  foto?: string
  rosterMemberId?: string
}

export type RosterSyncAdd = {
  parsed: ParsedStudent
  adSoyad: string
  no: string
}

export type RosterSyncUpdate = {
  memberId: string
  no: string
  previousAdSoyad: string
  nextAdSoyad: string
}

export type RosterSyncRemove = {
  memberId: string
  no: string
  adSoyad: string
}

export type RosterSyncPhoto = {
  studentId: string
  no: string
  adSoyad: string
  parsed: ParsedStudent
}

export type RosterSyncPlan = {
  adds: RosterSyncAdd[]
  updates: RosterSyncUpdate[]
  removes: RosterSyncRemove[]
  photos: RosterSyncPhoto[]
  unchanged: number
}

function normNo(no: unknown) {
  return String(no ?? '').trim().toLowerCase()
}

export function rosterSyncIsEmpty(plan: RosterSyncPlan) {
  return plan.adds.length === 0 && plan.updates.length === 0 && plan.removes.length === 0 && plan.photos.length === 0
}

export function buildRosterSyncPlan(
  current: RosterSyncMember[],
  excel: ParsedStudent[],
  formatName: (name: string) => string,
): RosterSyncPlan {
  const byNo = new Map<string, RosterSyncMember>()
  for (const member of current) {
    const key = normNo(member.no)
    if (key) byNo.set(key, member)
  }

  const excelByNo = new Map<string, ParsedStudent>()
  for (const row of excel) {
    const key = normNo(row.no)
    if (key) excelByNo.set(key, row)
  }

  const adds: RosterSyncAdd[] = []
  const updates: RosterSyncUpdate[] = []
  const photos: RosterSyncPhoto[] = []
  let unchanged = 0

  for (const row of excelByNo.values()) {
    const key = normNo(row.no)
    const nextName = formatName(row.adSoyad)
    const member = byNo.get(key)
    if (!member) {
      adds.push({ parsed: row, adSoyad: nextName, no: row.no })
      continue
    }
    const prevName = member.adSoyad.trim()
    const nameChanged = prevName.localeCompare(nextName, 'tr', { sensitivity: 'base' }) !== 0
    if (nameChanged) {
      updates.push({
        memberId: member.rosterMemberId || member.id,
        no: member.no,
        previousAdSoyad: prevName,
        nextAdSoyad: nextName,
      })
    }
    if (row.foto) {
      photos.push({ studentId: member.id, no: member.no, adSoyad: nextName, parsed: row })
    }
    if (!nameChanged && !row.foto) unchanged++
  }

  const removes: RosterSyncRemove[] = []
  for (const member of current) {
    const key = normNo(member.no)
    if (!key || excelByNo.has(key)) continue
    removes.push({
      memberId: member.rosterMemberId || member.id,
      no: member.no,
      adSoyad: member.adSoyad,
    })
  }

  return { adds, updates, removes, photos, unchanged }
}
