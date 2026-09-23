import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Application, BehaviorLog, Score, Student, StudentDashboard, StudentPortalPublic } from '@/types'

function sanitizeLogs(logs: BehaviorLog[] | undefined): StudentPortalPublic['behaviorLogs'] {
  return (logs ?? []).map((log) => ({
    id: log.id,
    type: log.type,
    note: log.note,
    date: log.date,
  }))
}

export async function syncStudentPortal(courseId: string, studentId: string): Promise<void> {
  if (!courseId || !studentId) return

  const [courseSnap, studentSnap, appsSnap] = await Promise.all([
    getDoc(doc(db, 'courses', courseId)),
    getDoc(doc(db, 'courses', courseId, 'students', studentId)),
    getDocs(collection(db, 'courses', courseId, 'applications')),
  ])

  if (!courseSnap.exists() || !studentSnap.exists()) return

  const course = courseSnap.data() as { dersAdi?: string; sinifAdi?: string; teacherId?: string }
  const student = { id: studentSnap.id, ...(studentSnap.data() as Omit<Student, 'id' | 'courseId'>) }
  const okulNo = String(student.no ?? '').trim()
  if (!okulNo) return

  const apps: Application[] = appsSnap.docs.map((d) => ({
    id: d.id,
    courseId,
    ...(d.data() as Omit<Application, 'id' | 'courseId'>),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
  }))
  apps.sort((a, b) => b.tarih.localeCompare(a.tarih))

  const scoreSnaps = await Promise.all(
    apps.map((app) => getDoc(doc(db, 'courses', courseId, 'applications', app.id, 'scores', studentId))),
  )

  const scores: StudentPortalPublic['scores'] = apps.map((app, i) => {
    const data = scoreSnaps[i].exists() ? (scoreSnaps[i].data() as Partial<Score>) : null
    return {
      appId: app.id,
      ad: app.ad,
      tarih: app.tarih,
      puan: data?.puan ?? null,
      devamsiz: data?.devamsiz,
      kisaNot: data?.kisaNot,
    }
  })

  await setDoc(doc(db, 'courses', courseId, 'students', studentId, 'portal', 'public'), {
    okulNo,
    adSoyad: student.adSoyad ?? '',
    dersAdi: course.dersAdi ?? '',
    sinifAdi: course.sinifAdi ?? '',
    behaviorStars: student.behaviorStars ?? { yellow: 0, purple: 0 },
    behaviorLogs: sanitizeLogs(student.behaviorLogs),
    scores,
    updatedAt: serverTimestamp(),
  })

  const dashRef = doc(db, 'studentDashboards', okulNo)
  const dashSnap = await getDoc(dashRef)
  const prev = dashSnap.exists() ? (dashSnap.data() as StudentDashboard) : null
  const courseEntry = {
    courseId,
    studentId,
    dersAdi: course.dersAdi ?? '',
    sinifAdi: course.sinifAdi ?? '',
  }
  const courses = [courseEntry, ...(prev?.courses ?? []).filter((c) => c.courseId !== courseId)]
  const teacherIds = Array.from(
    new Set([...(prev?.teacherIds ?? []), course.teacherId].filter(Boolean) as string[]),
  )

  await setDoc(
    dashRef,
    {
      no: okulNo,
      adSoyad: student.adSoyad ?? prev?.adSoyad ?? '',
      teacherIds,
      courses,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function schedulePortalSync(courseId: string, studentId: string) {
  const key = `${courseId}_${studentId}`
  const prev = timers.get(key)
  if (prev) clearTimeout(prev)
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key)
      syncStudentPortal(courseId, studentId).catch(console.error)
    }, 600),
  )
}
