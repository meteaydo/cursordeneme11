import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { formatClassName } from '@/lib/utils'
import type { RosterSyncPlan } from '@/lib/rosterSync'
import type { StudentFormData } from '@/types'

/**
 * Sınıfın tek öğrenci listesi: numara, ad ve fotoğraf.
 * Puan, bilgisayar numarası ve davranış ders belgesinde kalır.
 */

type BatchOp = {
  type: 'set' | 'update' | 'delete'
  ref: DocumentReference<any, any>
  data?: Record<string, unknown>
}

type Member = { id: string; no: string; adSoyad: string; foto: string; cinsiyet: 'K' | 'E' | '' }

function cinsiyetOf(value: unknown): 'K' | 'E' | '' {
  return value === 'K' || value === 'E' ? value : ''
}

type CourseMeta = { id: string; teacherId: string; sinifAdi: string; createdAt: Date }

type RosterInfo = {
  rosterId: string
  teacherId: string
  sinifAdi: string
  sourceCourseId: string
}

const tails = new Map<string, Promise<unknown>>()

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  tails.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}

function normNo(no: unknown) {
  return String(no ?? '').trim().toLowerCase()
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  return new Date(0)
}

export function classRosterId(teacherId: string, sinifAdi: string) {
  return `${teacherId}_${formatClassName(sinifAdi)}`
}

async function commitOps(ops: BatchOp[]) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + 400)) {
      if (op.type === 'set') batch.set(op.ref, (op.data ?? {}) as DocumentData)
      else if (op.type === 'update') batch.update(op.ref, (op.data ?? {}) as DocumentData)
      else batch.delete(op.ref)
    }
    await batch.commit()
  }
}

async function loadCourse(courseId: string): Promise<CourseMeta | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const snap = await getDoc(doc(db, 'courses', courseId))
    if (snap.exists()) {
      const data = snap.data()
      return {
        id: courseId,
        teacherId: String(data.teacherId || ''),
        sinifAdi: formatClassName(String(data.sinifAdi || '')),
        createdAt: toDate(data.createdAt),
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return null
}

async function docsOf(ref: ReturnType<typeof collection>) {
  try {
    return await getDocsFromServer(ref)
  } catch {
    return getDocs(ref)
  }
}

async function siblingCourses(teacherId: string, sinifAdi: string): Promise<CourseMeta[]> {
  const sinif = formatClassName(sinifAdi)
  const q = query(collection(db, 'courses'), where('teacherId', '==', teacherId))
  let snap
  try {
    snap = await getDocsFromServer(q)
  } catch {
    snap = await getDocs(q)
  }
  return snap.docs
    .filter((d) => formatClassName(String(d.data().sinifAdi || '')) === sinif)
    .map((d) => ({
      id: d.id,
      teacherId,
      sinifAdi: sinif,
      createdAt: toDate(d.data().createdAt),
    }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

async function findOldestListedCourse(teacherId: string, sinifAdi: string) {
  const courses = await siblingCourses(teacherId, sinifAdi)
  for (const course of courses) {
    const studs = await docsOf(collection(db, 'courses', course.id, 'students'))
    if (!studs.empty) return { courseId: course.id, docs: studs.docs }
  }
  return null
}

async function readMembers(rosterId: string): Promise<Member[]> {
  const snap = await getDocs(collection(db, 'classRosters', rosterId, 'students'))
  return snap.docs.map((d) => ({
    id: d.id,
    no: String(d.data().no ?? ''),
    adSoyad: String(d.data().adSoyad ?? ''),
    foto: String(d.data().foto ?? ''),
    cinsiyet: cinsiyetOf(d.data().cinsiyet),
  }))
}

function courseStudentFromMember(member: Member) {
  return {
    no: member.no,
    adSoyad: member.adSoyad,
    foto: member.foto,
    cinsiyet: member.cinsiyet,
    rosterMemberId: member.id,
    pcNo: '',
    eskiPcNolari: [],
    ozelDurumNotlari: '',
    behaviorStars: { yellow: 0, purple: 0 },
    behaviorLogs: [],
    createdAt: serverTimestamp(),
  }
}

async function ensureClassRoster(teacherId: string, sinifAdi: string): Promise<RosterInfo> {
  const sinif = formatClassName(sinifAdi)
  const rosterId = classRosterId(teacherId, sinif)
  const rosterRef = doc(db, 'classRosters', rosterId)
  let parent = await getDoc(rosterRef)

  if (!parent.exists()) {
    await setDoc(rosterRef, {
      teacherId,
      sinifAdi: sinif,
      sourceCourseId: '',
      ready: false,
      createdAt: serverTimestamp(),
    })
    parent = await getDoc(rosterRef)
  }

  if (parent.data()?.ready) {
    const members = await readMembers(rosterId)
    if (members.length > 0) {
      return {
        rosterId,
        teacherId,
        sinifAdi: sinif,
        sourceCourseId: String(parent.data()?.sourceCourseId || ''),
      }
    }
  }

  const courses = await siblingCourses(teacherId, sinif)
  let sourceId = ''
  let sourceDocs: QueryDocumentSnapshot<DocumentData>[] = []
  for (const course of courses) {
    const studs = await getDocs(collection(db, 'courses', course.id, 'students'))
    if (!studs.empty) {
      sourceId = course.id
      sourceDocs = studs.docs as QueryDocumentSnapshot<DocumentData>[]
      break
    }
  }

  if (sourceDocs.length) {
    await commitOps(
      sourceDocs.map((d) => ({
        type: 'set' as const,
        ref: doc(db, 'classRosters', rosterId, 'students', d.id),
        data: {
          no: d.data().no ?? '',
          adSoyad: d.data().adSoyad ?? '',
          foto: d.data().foto ?? '',
          cinsiyet: cinsiyetOf(d.data().cinsiyet),
          createdAt: d.data().createdAt ?? serverTimestamp(),
        },
      })),
    )
    await commitOps(
      sourceDocs.map((d) => ({
        type: 'update' as const,
        ref: d.ref,
        data: { rosterMemberId: d.id },
      })),
    )
  }

  await updateDoc(rosterRef, { ready: true, sourceCourseId: sourceId })
  return { rosterId, teacherId, sinifAdi: sinif, sourceCourseId: sourceId }
}

async function claimSource(info: RosterInfo, courseId: string) {
  if (info.sourceCourseId) return info
  await updateDoc(doc(db, 'classRosters', info.rosterId), { sourceCourseId: courseId })
  return { ...info, sourceCourseId: courseId }
}

async function fillCourseIfEmpty(courseId: string, sourceDocs: QueryDocumentSnapshot<DocumentData>[]) {
  if (sourceDocs.length === 0) return
  const existing = await docsOf(collection(db, 'courses', courseId, 'students'))
  if (!existing.empty) return

  const ops: BatchOp[] = sourceDocs.map((d) => ({
    type: 'set',
    ref: doc(db, 'courses', courseId, 'students', d.id),
    data: {
      no: d.data().no ?? '',
      adSoyad: d.data().adSoyad ?? '',
      foto: d.data().foto ?? '',
      cinsiyet: cinsiyetOf(d.data().cinsiyet),
      rosterMemberId: d.id,
      pcNo: '',
      eskiPcNolari: [],
      ozelDurumNotlari: '',
      behaviorStars: { yellow: 0, purple: 0 },
      behaviorLogs: [],
      createdAt: serverTimestamp(),
    },
  }))
  await commitOps(ops)
}

export async function syncCourseWithRoster(courseId: string) {
  const meta = await loadCourse(courseId)
  if (!meta?.teacherId || !meta.sinifAdi) return

  const key = classRosterId(meta.teacherId, meta.sinifAdi)
  await withLock(key, async () => {
    const source = await findOldestListedCourse(meta.teacherId, meta.sinifAdi)
    if (!source || source.courseId === courseId) return
    await fillCourseIfEmpty(courseId, source.docs)
    try {
      const courses = await siblingCourses(meta.teacherId, meta.sinifAdi)
      for (const course of courses) {
        if (course.id !== courseId && course.id !== source.courseId) {
          await fillCourseIfEmpty(course.id, source.docs)
        }
      }
      await ensureClassRoster(meta.teacherId, meta.sinifAdi)
    } catch (error) {
      console.error('Ortak liste kaydı:', error)
    }
  })
}

async function findCourseStudentId(courseId: string, member: Member) {
  const studs = await getDocs(collection(db, 'courses', courseId, 'students'))
  const found = studs.docs.find((d) => {
    const data = d.data()
    return d.id === member.id || data.rosterMemberId === member.id || normNo(data.no) === normNo(member.no)
  })
  if (found) return found.id
  const ref = doc(db, 'courses', courseId, 'students', member.id)
  await setDoc(ref, courseStudentFromMember(member))
  return ref.id
}

export async function addSharedStudent(courseId: string, data: StudentFormData & { id?: string }) {
  const meta = await loadCourse(courseId)
  if (!meta?.teacherId || !meta.sinifAdi) {
    const ref = data.id ? doc(db, 'courses', courseId, 'students', data.id) : doc(collection(db, 'courses', courseId, 'students'))
    await setDoc(ref, { ...data, createdAt: serverTimestamp() })
    return ref.id
  }

  const key = classRosterId(meta.teacherId, meta.sinifAdi)
  return withLock(key, async () => {
    let info = await ensureClassRoster(meta.teacherId, meta.sinifAdi)
    info = await claimSource(info, courseId)
    const members = await readMembers(info.rosterId)
    const existing = members.find((member) => normNo(member.no) === normNo(data.no))
    if (existing) return findCourseStudentId(courseId, existing)

    const memberRef = data.id
      ? doc(db, 'classRosters', info.rosterId, 'students', data.id)
      : doc(collection(db, 'classRosters', info.rosterId, 'students'))
    const memberId = memberRef.id
    const member: Member = {
      id: memberId,
      no: data.no,
      adSoyad: data.adSoyad,
      foto: data.foto || '',
      cinsiyet: cinsiyetOf(data.cinsiyet),
    }
    await setDoc(memberRef, {
      no: member.no,
      adSoyad: member.adSoyad,
      foto: member.foto,
      cinsiyet: member.cinsiyet,
      createdAt: serverTimestamp(),
    })

    const courses = await siblingCourses(meta.teacherId, meta.sinifAdi)
    if (!courses.some((course) => course.id === courseId)) courses.push(meta)

    const ops: BatchOp[] = []
    for (const course of courses) {
      if (course.id === courseId) {
        const { id: _id, ...fields } = data
        ops.push({
          type: 'set',
          ref: doc(db, 'courses', courseId, 'students', memberId),
          data: {
            ...fields,
            foto: fields.foto || '',
            rosterMemberId: memberId,
            createdAt: serverTimestamp(),
          },
        })
      } else {
        ops.push({
          type: 'set',
          ref: doc(collection(db, 'courses', course.id, 'students')),
          data: courseStudentFromMember(member),
        })
      }
    }
    await commitOps(ops)
    return memberId
  })
}

export async function addSharedStudentsBulk(courseId: string, list: (StudentFormData & { id?: string })[]) {
  const meta = await loadCourse(courseId)
  if (!meta?.teacherId || !meta.sinifAdi) {
    const ids: string[] = []
    const ops: BatchOp[] = list.map((student) => {
      const ref = student.id
        ? doc(db, 'courses', courseId, 'students', student.id)
        : doc(collection(db, 'courses', courseId, 'students'))
      ids.push(ref.id)
      const { id: _id, ...fields } = student
      return { type: 'set' as const, ref, data: { ...fields, createdAt: serverTimestamp() } }
    })
    await commitOps(ops)
    return ids
  }

  const key = classRosterId(meta.teacherId, meta.sinifAdi)
  return withLock(key, async () => {
    let info = await ensureClassRoster(meta.teacherId, meta.sinifAdi)
    info = await claimSource(info, courseId)
    const members = await readMembers(info.rosterId)
    const knownNos = new Set(members.map((member) => normNo(member.no)))
    const courses = await siblingCourses(meta.teacherId, meta.sinifAdi)
    if (!courses.some((course) => course.id === courseId)) courses.push(meta)

    const ids: string[] = []
    const ops: BatchOp[] = []

    for (const student of list) {
      const no = normNo(student.no)
      const existing = members.find((member) => normNo(member.no) === no)
      if (existing || knownNos.has(no)) {
        const member = existing ?? members.find((item) => normNo(item.no) === no)!
        ids.push(await findCourseStudentId(courseId, member))
        continue
      }

      const memberId = student.id || doc(collection(db, 'classRosters', info.rosterId, 'students')).id
      const member: Member = {
        id: memberId,
        no: student.no,
        adSoyad: student.adSoyad,
        foto: student.foto || '',
        cinsiyet: cinsiyetOf(student.cinsiyet),
      }
      ids.push(memberId)
      knownNos.add(no)
      members.push(member)

      ops.push({
        type: 'set',
        ref: doc(db, 'classRosters', info.rosterId, 'students', memberId),
        data: {
          no: member.no,
          adSoyad: member.adSoyad,
          foto: member.foto,
          cinsiyet: member.cinsiyet,
          createdAt: serverTimestamp(),
        },
      })

      for (const course of courses) {
        if (course.id === courseId) {
          const { id: _id, ...fields } = student
          ops.push({
            type: 'set',
            ref: doc(db, 'courses', courseId, 'students', memberId),
            data: {
              ...fields,
              foto: fields.foto || '',
              rosterMemberId: memberId,
              createdAt: serverTimestamp(),
            },
          })
        } else {
          ops.push({
            type: 'set',
            ref: doc(collection(db, 'courses', course.id, 'students')),
            data: courseStudentFromMember(member),
          })
        }
      }
    }

    await commitOps(ops)
    return ids
  })
}

async function removeMemberEverywhere(meta: CourseMeta, memberId: string, noHint = '') {
  const key = classRosterId(meta.teacherId, meta.sinifAdi)
  await deleteDoc(doc(db, 'classRosters', key, 'students', memberId)).catch(() => undefined)

  const courses = await siblingCourses(meta.teacherId, meta.sinifAdi)
  if (!courses.some((course) => course.id === meta.id)) courses.push(meta)

  const no = normNo(noHint)
  const ops: BatchOp[] = []
  for (const course of courses) {
    const studs = await getDocs(collection(db, 'courses', course.id, 'students'))
    for (const studentDoc of studs.docs) {
      const row = studentDoc.data()
      const linked =
        studentDoc.id === memberId ||
        row.rosterMemberId === memberId ||
        (no && normNo(row.no) === no)
      if (linked) ops.push({ type: 'delete', ref: studentDoc.ref })
    }
  }
  await commitOps(ops)
}

async function patchMemberEverywhere(meta: CourseMeta, memberId: string, patch: Record<string, unknown>) {
  if (Object.keys(patch).length === 0) return
  const key = classRosterId(meta.teacherId, meta.sinifAdi)
  const memberRef = doc(db, 'classRosters', key, 'students', memberId)
  const memberSnap = await getDoc(memberRef)
  const ops: BatchOp[] = []
  if (memberSnap.exists()) ops.push({ type: 'update', ref: memberRef, data: patch })

  const courses = await siblingCourses(meta.teacherId, meta.sinifAdi)
  if (!courses.some((course) => course.id === meta.id)) courses.push(meta)

  for (const course of courses) {
    const studs = await getDocs(collection(db, 'courses', course.id, 'students'))
    for (const studentDoc of studs.docs) {
      const row = studentDoc.data()
      if (studentDoc.id === memberId || row.rosterMemberId === memberId) {
        ops.push({ type: 'update', ref: studentDoc.ref, data: patch })
      }
    }
  }
  await commitOps(ops)
}

export async function applyRosterSyncPlan(
  courseId: string,
  plan: RosterSyncPlan,
  newStudents: (StudentFormData & { id?: string })[],
) {
  const meta = await loadCourse(courseId)
  if (!meta?.teacherId || !meta.sinifAdi) {
    for (const remove of plan.removes) {
      await deleteDoc(doc(db, 'courses', courseId, 'students', remove.memberId)).catch(() => undefined)
    }
    for (const update of plan.updates) {
      await updateDoc(doc(db, 'courses', courseId, 'students', update.memberId), {
        adSoyad: update.nextAdSoyad,
      }).catch(() => undefined)
    }
    if (newStudents.length) await addSharedStudentsBulk(courseId, newStudents)
    return
  }

  const lockKey = classRosterId(meta.teacherId, meta.sinifAdi)
  await withLock(lockKey, () => ensureClassRoster(meta.teacherId, meta.sinifAdi))

  for (const remove of plan.removes) {
    await withLock(lockKey, async () => {
      const fresh = await loadCourse(courseId)
      if (!fresh?.teacherId || !fresh.sinifAdi) return
      await removeMemberEverywhere(fresh, remove.memberId, remove.no)
    })
  }
  for (const update of plan.updates) {
    await withLock(lockKey, async () => {
      const fresh = await loadCourse(courseId)
      if (!fresh?.teacherId || !fresh.sinifAdi) return
      await patchMemberEverywhere(fresh, update.memberId, { adSoyad: update.nextAdSoyad })
    })
  }
  if (newStudents.length) {
    await addSharedStudentsBulk(courseId, newStudents)
  }
}

export async function deleteSharedStudent(courseId: string, studentId: string) {
  const meta = await loadCourse(courseId)
  if (!meta?.teacherId || !meta.sinifAdi) {
    await deleteDoc(doc(db, 'courses', courseId, 'students', studentId))
    return
  }

  await withLock(classRosterId(meta.teacherId, meta.sinifAdi), async () => {
    const studentSnap = await getDoc(doc(db, 'courses', courseId, 'students', studentId))
    const data = studentSnap.data()
    const memberId = String(data?.rosterMemberId || studentId)
    const no = normNo(data?.no)
    await removeMemberEverywhere(meta, memberId, no)
  })
}

export async function fanOutStudentIdentity(
  courseId: string,
  studentId: string,
  identity: { no?: string; adSoyad?: string; foto?: string; cinsiyet?: 'K' | 'E' | '' },
) {
  const patch = Object.fromEntries(Object.entries(identity).filter(([, value]) => value !== undefined))
  if (Object.keys(patch).length === 0) return

  const meta = await loadCourse(courseId)
  if (!meta?.teacherId || !meta.sinifAdi) return

  const key = classRosterId(meta.teacherId, meta.sinifAdi)
  await withLock(key, async () => {
    const studentRef = doc(db, 'courses', courseId, 'students', studentId)
    const studentSnap = await getDoc(studentRef)
    if (!studentSnap.exists()) return
    const memberId = String(studentSnap.data().rosterMemberId || '')
    if (!memberId) return

    const memberRef = doc(db, 'classRosters', key, 'students', memberId)
    const memberSnap = await getDoc(memberRef)
    if (!memberSnap.exists()) return

    const ops: BatchOp[] = [{ type: 'update', ref: memberRef, data: patch }]
    const courses = await siblingCourses(meta.teacherId, meta.sinifAdi)
    if (!courses.some((course) => course.id === courseId)) courses.push(meta)

    for (const course of courses) {
      const studs = await getDocs(collection(db, 'courses', course.id, 'students'))
      for (const studentDoc of studs.docs) {
        if (studentDoc.id === memberId || studentDoc.data().rosterMemberId === memberId) {
          ops.push({ type: 'update', ref: studentDoc.ref, data: patch })
        }
      }
    }
    await commitOps(ops)
  })
}

export async function propagateStudentFoto(courseId: string, studentId: string, foto: string) {
  await fanOutStudentIdentity(courseId, studentId, { foto })
}
