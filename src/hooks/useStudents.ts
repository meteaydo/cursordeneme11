import { useState, useEffect } from 'react'
import {
  collection,
  query,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
  setDoc,
  arrayUnion,
  arrayRemove,
  increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Student, StudentFormData } from '@/types'

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
    
    const q = query(
      collection(db, 'courses', courseId, 'students'),
    )
    const unsub = onSnapshot(q, (snap) => {
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
    return unsub
  }, [courseId])

  const addStudent = async (data: StudentFormData) => {
    // Generate ID for optimistic UI
    const docRef = doc(collection(db, 'courses', courseId, 'students'))
    
    setDoc(docRef, {
      ...data,
      createdAt: serverTimestamp(),
    }).catch(console.error)
    
    return docRef.id
  }

  const addStudentsBulk = async (studentList: (StudentFormData & { id?: string })[]): Promise<string[]> => {
    const batch = writeBatch(db)
    const ids: string[] = []
    studentList.forEach((s) => {
      const ref = s.id ? doc(db, 'courses', courseId, 'students', s.id) : doc(collection(db, 'courses', courseId, 'students'))
      ids.push(ref.id)
      const { id: _id, ...data } = s
      batch.set(ref, { ...data, createdAt: serverTimestamp() })
    })
    await batch.commit().catch(console.error)
    return ids
  }

  const updateStudent = async (studentId: string, data: Partial<StudentFormData>) => {
    const batch = writeBatch(db);
    
    // Mevcut öğrencinin bilgilerini bul (takas için eski PC numarasını bilmemiz gerek)
    const currentStudent = students.find(s => s.id === studentId);
    const oldPcNo = currentStudent?.pcNo || '';

    // PC No değiştiyse ve yeni PC No boş değilse, eski PC numarasını eskiPcNolari dizisine ekle
    if (data.pcNo !== undefined && data.pcNo !== oldPcNo && oldPcNo.trim() !== '') {
      const currentEskiPcNolari = currentStudent?.eskiPcNolari || [];
      // Eski PC numarası zaten listede yoksa ekle
      if (!currentEskiPcNolari.includes(oldPcNo)) {
        const updatedEskiPcNolari = [...currentEskiPcNolari, oldPcNo];
        data.eskiPcNolari = updatedEskiPcNolari;
      }
    }

    // PC No takası (Swap): Eğer yeni bir PC No atanıyorsa ve bu numara başkasındaysa
    if (data.pcNo && data.pcNo.trim() !== '' && data.pcNo !== oldPcNo) {
      const conflictStudent = students.find(s => s.pcNo === data.pcNo && s.id !== studentId);
      
      if (conflictStudent) {
        // Çakışan öğrencinin eski PC numarasını eskiPcNolari dizisine ekle
        const conflictOldPcNo = conflictStudent.pcNo || '';
        const conflictEskiPcNolari = conflictStudent.eskiPcNolari || [];
        if (conflictOldPcNo.trim() !== '' && !conflictEskiPcNolari.includes(conflictOldPcNo)) {
          const updatedConflictEskiPcNolari = [...conflictEskiPcNolari, conflictOldPcNo];
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
      log.photoUrl = photoUrls[0] // for backwards compatibility if needed
    }
    
    const studentRef = doc(db, 'courses', courseId, 'students', studentId)
    await updateDoc(studentRef, {
      [`behaviorStars.${type}`]: increment(1),
      behaviorLogs: arrayUnion(log)
    }).catch(console.error)
  }

  const deleteBehaviorLog = async (studentId: string, log: any) => {
    const studentRef = doc(db, 'courses', courseId, 'students', studentId)
    await updateDoc(studentRef, {
      [`behaviorStars.${log.type}`]: increment(-1),
      behaviorLogs: arrayRemove(log)
    }).catch(console.error)
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
    }).catch(console.error)
  }

  const deleteStudent = async (studentId: string) => {
    deleteDoc(doc(db, 'courses', courseId, 'students', studentId)).catch(console.error)
  }

  return { students, loading, addStudent, addStudentsBulk, updateStudent, addBehaviorStar, deleteBehaviorLog, updateBehaviorLog, deleteStudent }
}
