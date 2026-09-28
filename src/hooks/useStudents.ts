import { useState, useEffect } from 'react'
import {
  collection,
  query,
  onSnapshot,
  updateDoc,
  doc,
  writeBatch,
  arrayUnion,
  arrayRemove,
  increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Student, StudentFormData } from '@/types'
import { dedupeEskiPcNolari, pcNoKey, samePcNo } from '@/lib/utils'
import { schedulePortalSync } from '@/lib/studentPortal'
import { toast } from '@/hooks/use-toast'
import {
  addSharedStudent,
  addSharedStudentsBulk,
  deleteSharedStudent,
  fanOutStudentIdentity,
  syncCourseWithRoster,
} from '@/services/classRosterService'

export function useStudents(courseId: string) {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Boş veya geçersiz courseId durumunu kontrol et
    if (!courseId || courseId.trim() === '') {
      setStudents([])
      setLoading(false)
      return
    }

    setLoading(true)
    let unsub = () => {}
    let cancelled = false
    ;(async () => {
      try {
        await syncCourseWithRoster(courseId)
      } catch (error) {
        console.error('Ortak sınıf listesi eşitlenemedi:', error)
        toast({
          title: 'Liste kopyalanamadı',
          description: error instanceof Error ? error.message : 'Kayıtlı öğrenci listesi alınamadı.',
          variant: 'destructive',
        })
      }
      if (cancelled) return
      const q = query(collection(db, 'courses', courseId, 'students'))
      unsub = onSnapshot(q, (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          courseId,
          ...(d.data() as Omit<Student, 'id' | 'courseId'>),
          createdAt: d.data().createdAt?.toDate() ?? new Date(),
        }))
        list.sort((a, b) => Number(a.no) - Number(b.no) || a.no.localeCompare(b.no))
        setStudents(list)
        setLoading(false)
      }, (error) => {
        console.error('Firestore students listener error:', error)
        setStudents([])
        setLoading(false)
      })
    })()
    return () => {
      cancelled = true
      unsub()
    }
  }, [courseId])

  const addStudent = async (data: StudentFormData) => {
    return addSharedStudent(courseId, data)
  }

  const addStudentsBulk = async (studentList: (StudentFormData & { id?: string })[]): Promise<string[]> => {
    return addSharedStudentsBulk(courseId, studentList)
  }

  const updateStudent = async (studentId: string, data: Partial<StudentFormData>) => {
    const batch = writeBatch(db);
    
    // Mevcut öğrencinin bilgilerini bul (takas için eski PC numarasını bilmemiz gerek)
    const currentStudent = students.find(s => s.id === studentId);
    const oldPcNo = currentStudent?.pcNo || '';

    if (data.pcNo !== undefined) {
      const currentEski = data.eskiPcNolari ?? currentStudent?.eskiPcNolari ?? [];
      const oldKey = pcNoKey(oldPcNo);
      const newKey = pcNoKey(data.pcNo);
      const shouldArchive = oldKey !== '' && oldKey !== newKey;
      data.eskiPcNolari = shouldArchive
        ? dedupeEskiPcNolari(currentEski, oldPcNo)
        : dedupeEskiPcNolari(currentEski);
    } else if (data.eskiPcNolari) {
      data.eskiPcNolari = dedupeEskiPcNolari(data.eskiPcNolari);
    }

    // PC No takası (Swap): Eğer yeni bir PC No atanıyorsa ve bu numara başkasındaysa
    if (data.pcNo && data.pcNo.trim() !== '' && data.pcNo !== oldPcNo) {
      const conflictStudent = students.find(s => s.id !== studentId && samePcNo(s.pcNo, data.pcNo));
      
      if (conflictStudent) {
        // Çakışan öğrencinin eski PC numarasını eskiPcNolari dizisine ekle
        const conflictOldPcNo = conflictStudent.pcNo || '';
        const conflictEskiPcNolari = conflictStudent.eskiPcNolari || [];
        if (conflictOldPcNo.trim() !== '' && pcNoKey(conflictOldPcNo) !== pcNoKey(data.pcNo || '')) {
          const updatedConflictEskiPcNolari = dedupeEskiPcNolari(conflictEskiPcNolari, conflictOldPcNo);
          const conflictRef = doc(db, 'courses', courseId, 'students', conflictStudent.id);
          // TAKAS KAPATILDI: Çakışan öğrencinin numarası boşaltılır (diğerinin eski numarasını almaz)
          batch.update(conflictRef, { pcNo: '', eskiPcNolari: updatedConflictEskiPcNolari });
        } else {
          // Çakışan öğrenciyi boşa çıkar
          const conflictRef = doc(db, 'courses', courseId, 'students', conflictStudent.id);
          batch.update(conflictRef, { pcNo: '' });
        }
      }
    }
    
    // Asıl öğrenciyi güncelle
    const studentRef = doc(db, 'courses', courseId, 'students', studentId);
    batch.update(studentRef, data);

    await batch.commit().catch(console.error);

    const current = students.find((s) => s.id === studentId)
    const identity: { no?: string; adSoyad?: string; foto?: string } = {}
    if (data.no !== undefined && data.no !== current?.no) identity.no = data.no
    if (data.adSoyad !== undefined && data.adSoyad !== current?.adSoyad) identity.adSoyad = data.adSoyad
    if (
      data.foto !== undefined &&
      !String(data.foto).startsWith('blob:') &&
      (data.foto || '') !== (current?.foto || '')
    ) {
      identity.foto = data.foto
    }
    if (Object.keys(identity).length) {
      await fanOutStudentIdentity(courseId, studentId, identity).catch(console.error)
    }
  }

  const addBehaviorStar = async (studentId: string, type: 'yellow' | 'purple', note: string, photoUrls?: string[]) => {
    const log: any = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      type,
      note,
      date: new Date().toISOString()
    }
    if (photoUrls && photoUrls.length > 0) {
      log.photoUrls = photoUrls
      log.photoUrl = photoUrls[0]
    }
    
    const studentRef = doc(db, 'courses', courseId, 'students', studentId)
    
    // Firestore increment nested field creates the path if it doesn't exist.
    // However, to be absolutely safe and ensure the structure is correct:
    await updateDoc(studentRef, {
      [`behaviorStars.${type}`]: increment(1),
      behaviorLogs: arrayUnion(log)
    }).then(() => schedulePortalSync(courseId, studentId)).catch(async (error) => {
      // If behaviorStars field doesn't exist at all, some older environments might fail.
      // Although modern Firestore handles this, let's add a fallback if needed.
      console.error('addBehaviorStar error:', error)
      throw error
    })
  }

  const deleteBehaviorLog = async (studentId: string, log: any) => {
    const studentRef = doc(db, 'courses', courseId, 'students', studentId)
    await updateDoc(studentRef, {
      [`behaviorStars.${log.type}`]: increment(-1),
      behaviorLogs: arrayRemove(log)
    }).then(() => schedulePortalSync(courseId, studentId)).catch(console.error)
  }

  const updateBehaviorLog = async (studentId: string, oldLog: any, updatedLog: any) => {
    // Firebase doesn't have an arrayReplace, so we remove the old and add the new
    const studentRef = doc(db, 'courses', courseId, 'students', studentId)
    
    // First, calculate if star counts need to change
    const starUpdates: any = {}
    if (oldLog.type !== updatedLog.type) {
      starUpdates[`behaviorStars.${oldLog.type}`] = increment(-1)
      starUpdates[`behaviorStars.${updatedLog.type}`] = increment(1)
    }

    await updateDoc(studentRef, {
      ...starUpdates,
      behaviorLogs: arrayRemove(oldLog)
    })
    
    await updateDoc(studentRef, {
      behaviorLogs: arrayUnion(updatedLog)
    }).then(() => schedulePortalSync(courseId, studentId)).catch(console.error)
  }

  const deleteStudent = async (studentId: string) => {
    await deleteSharedStudent(courseId, studentId)
  }

  return { students, loading, addStudent, addStudentsBulk, updateStudent, addBehaviorStar, deleteBehaviorLog, updateBehaviorLog, deleteStudent }
}
