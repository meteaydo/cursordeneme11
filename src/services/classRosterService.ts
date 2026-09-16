import { collection, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export async function copyClassRosterToCourse(classId: string, courseId: string): Promise<number> {
  const snap = await getDocs(collection(db, 'classes', classId, 'students'))
  if (snap.empty) return 0

  const docs = snap.docs
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db)
    docs.slice(i, i + 400).forEach((d, idx) => {
      const data = d.data()
      const ref = doc(collection(db, 'courses', courseId, 'students'))
      const pcIndex = i + idx + 1
      batch.set(ref, {
        no: data.no,
        adSoyad: data.adSoyad,
        foto: data.foto || '',
        pcNo: data.pcNo || `PC${String(pcIndex).padStart(2, '0')}`,
        eskiPcNolari: [],
        ozelDurumNotlari: '',
        behaviorStars: { yellow: 0, purple: 0 },
        behaviorLogs: [],
        createdAt: serverTimestamp(),
      })
    })
    await batch.commit()
  }
  return docs.length
}