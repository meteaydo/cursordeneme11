import { useState, useEffect, useRef } from 'react'
import { useParams, useLocation } from 'react-router-dom'
// @ts-ignore
import { v4 as uuidv4 } from 'uuid'
import { 
  DndContext, 
  useSensor, 
  useSensors, 
  MouseSensor, 
  TouchSensor, 
  useDroppable,
  DragEndEvent,
  DragStartEvent,
  DragMoveEvent,
  Modifier
} from '@dnd-kit/core'
// @ts-ignore
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch"
import { Layout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { useCourses } from '@/hooks/useCourses'
import { useStudents } from '@/hooks/useStudents'
import { useApplications } from '@/hooks/useApplications'
import { queueImageUpload } from '@/lib/imageQueue'
import { toast } from '@/hooks/use-toast'
import type { SeatObject, Score } from '@/types'
import { DraggableItem } from './components/DraggableItem'
import { SmartNumpad } from '@/components/ui/smart-numpad'
import { Loader2, Save, RotateCcw, Plus, MousePointer2, Wrench, Undo2, Minus, LayoutGrid, Monitor, Trash2 } from 'lucide-react'


const getObjectSize = (type: string) => {
  switch (type) {
    case 'tahta': return { w: 200, h: 40 }
    case 'masa': return { w: 120, h: 60 }
    case 'empty_object': return { w: 60, h: 60 }
    case 'pc_label': return { w: 60, h: 34 }
    default: return { w: 70, h: 70 } // student, empty_desk
  }
}

function AutoFitter({ onFit, loaded, layoutVersion }: { onFit: () => void, loaded: boolean, layoutVersion: number }) {
  const [lastVersion, setLastVersion] = useState(-1);
  const onFitRef = useRef(onFit);
  onFitRef.current = onFit;

  useEffect(() => {
    if (loaded && lastVersion !== layoutVersion) {
      setTimeout(() => {
        onFitRef.current();
      }, 100);
      setLastVersion(layoutVersion);
    }
  }, [loaded, layoutVersion, lastVersion]);

  return null;
}

export function SeatingPlanPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const location = useLocation()
  const navState = location.state as { applicationId?: string; applicationAd?: string } | null
  
  const { courses, updateCourse, loading: courseLoading } = useCourses()
  const { students, loading: studentsLoading, updateStudent } = useStudents(courseId!)
  const { setScore, getScores } = useApplications(courseId!)

  const course = courses.find((c) => c.id === courseId)

  // Active application for scoring (from navigation state)
  const activeApplicationId = navState?.applicationId ?? null
  const activeApplicationAd = navState?.applicationAd ?? null

  // Scores state: studentId -> Score
  const [scores, setScores] = useState<Record<string, Score>>({})
  const [scoresLoaded, setScoresLoaded] = useState(false)
  void scoresLoaded // suppress unused warning
  const [numpadOpenFor, setNumpadOpenFor] = useState<string | null>(null)
  const [cameraOpenFor, setCameraOpenFor] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [objects, setObjects] = useState<SeatObject[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [isToolbarOpen, setIsToolbarOpen] = useState(false)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [history, setHistory] = useState<SeatObject[][]>([])

  // PC label snap state — useRef ile senkron tutuluyor (render tetiklemez)
  // Render için ayrıca pcSnapTargetState kullanılır (sadece görsel güncelleme)
  type PcSnapSide = 'top' | 'right' | 'bottom' | 'left'
  type PcSnapTarget = { studentObjId: string; side: PcSnapSide } | null
  const pcSnapTargetRef = useRef<PcSnapTarget>(null)
  const [pcSnapTarget, setPcSnapTarget] = useState<PcSnapTarget>(null)
  // Persist debounce timer
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Tıklama ile açık menüleri kapatma (Toolbar)
  useEffect(() => {
    if (!isToolbarOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setIsToolbarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, { capture: true });
    document.addEventListener('touchstart', handleClickOutside, { capture: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, { capture: true });
      document.removeEventListener('touchstart', handleClickOutside, { capture: true });
    };
  }, [isToolbarOpen]);

  // Zoom ölçeğine göre hareketleri düzenleyen dnd modifier
  // useRef kullanıyoruz — closure stale'ini önler, modifier her zaman güncel scale'i okur
  const scaleRef = useRef(1);
  // Custom wheel zoom için refs
  const transformUtilsRef = useRef<any>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);

  // activeId değiştiğinde ref'i güncelle (wheel closure'da stale olmasın)
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Custom native wheel handler — milimetrik hassasiyette, cursor merkezli zoom
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Sürükleme varsa zoom'u engelle
      if (activeIdRef.current !== null) return;
      e.preventDefault();

      const utils = transformUtilsRef.current;
      if (!utils) return;

      const { state } = utils;
      const currentScale: number = state.scale;
      const currentTx: number = state.positionX;
      const currentTy: number = state.positionY;

      // Her notch için %10 ölçek değişimi
      const ZOOM_FACTOR = 0.1;
      // deltaY normalize et — trackpad çok küçük değerler üretir, mouse 100+ üretir
      // Clamp ile aşırı hız önlenir (tek scroll max 1 notch sayılır)
      const normalizedDelta = Math.sign(e.deltaY);
      const factor = 1 - normalizedDelta * ZOOM_FACTOR;

      const newScale = Math.max(0.1, Math.min(3, currentScale * factor));
      if (newScale === currentScale) return;

      // Zoom'u mouse cursor pozisyonuna göre ortala
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const ratio = newScale / currentScale;
      const newTx = mouseX - (mouseX - currentTx) * ratio;
      const newTy = mouseY - (mouseY - currentTy) * ratio;

      scaleRef.current = newScale;
      utils.setTransform(newTx, newTy, newScale, 0);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  // courseLoading/studentsLoading değişince canvas div DOM'a girer, listener o zaman eklenir
  }, [courseLoading, studentsLoading]);


  const getSnapPosition = (activeId: string, unscaledX: number, unscaledY: number, currentObjects: SeatObject[]) => {
    const activeObj = currentObjects.find(o => `canvas_${o.id}` === activeId);
    if (!activeObj) return { snapX: 0, snapY: 0, guides: [] };

    const { w: aw, h: ah } = getObjectSize(activeObj.type);
    const targetCenterX = activeObj.x + unscaledX + aw / 2;
    const targetCenterY = activeObj.y + unscaledY + ah / 2;

    let snapX: number | null = null;
    let snapY: number | null = null;
    let minDiffX = Infinity;
    let minDiffY = Infinity;
    const SNAP_THRESHOLD = 20; 
    const newGuides: Array<{ axis: 'x' | 'y', pos: number }> = [];

    // Toplu seçimde sürükleniyorsa, aynı gruptaki rölanti objelere yaslanma
    const isMultiDragging = isSelectionMode && selectedIds.includes(activeObj.id);

    for (const obj of currentObjects) {
      if (obj.id === activeObj.id) continue;
      if (isMultiDragging && selectedIds.includes(obj.id)) continue;
      
      // Sadece "öğrenci kartı" ve "boş sıralar" ile hizalan
      if (obj.type !== 'student' && obj.type !== 'empty_desk') continue;

      const { w: ow, h: oh } = getObjectSize(obj.type);
      const otherCenterX = obj.x + ow / 2;
      const otherCenterY = obj.y + oh / 2;

      // X ekseni merkezi yakalama (Dikey çizgi)
      const diffX = Math.abs(targetCenterX - otherCenterX);
      if (diffX < SNAP_THRESHOLD && diffX < minDiffX) {
        minDiffX = diffX;
        snapX = otherCenterX - targetCenterX;
      }

      // Y ekseni merkezi yakalama (Yatay çizgi)
      const diffY = Math.abs(targetCenterY - otherCenterY);
      if (diffY < SNAP_THRESHOLD && diffY < minDiffY) {
        minDiffY = diffY;
        snapY = otherCenterY - targetCenterY;
      }
    }


    // Nihai kılavuz çizgileri (Dikey ve Yatay)
    if (snapX !== null) newGuides.push({ axis: 'x', pos: targetCenterX + snapX });
    if (snapY !== null) newGuides.push({ axis: 'y', pos: targetCenterY + snapY });

    return { snapX: snapX || 0, snapY: snapY || 0, guides: newGuides };
  }

  const customZoomAndSnapModifier: Modifier = ({ transform, active }) => {
    if (!active) return transform;

    const scale = scaleRef.current;

    // Tüm nesneler: sadece zoom ölçeğini uygula, snap yok → parmak tam takibi
    const unscaledX = transform.x / scale;
    const unscaledY = transform.y / scale;

    // Çoklu sürükleme için CSS değişkenlerini güncelle
    const canvas = document.getElementById('seating-canvas');
    if (canvas && isSelectionMode) {
      canvas.style.setProperty('--drag-x', `${unscaledX}px`);
      canvas.style.setProperty('--drag-y', `${unscaledY}px`);
    }

    return {
      ...transform,
      x: unscaledX,
      y: unscaledY,
    };
  }

  const pushHistory = () => {
    setHistory(prev => [...prev, objects].slice(-20)); // En son 20 adımı hafızada tut
  }

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setObjects(previousState);
    persistPlan(previousState);
    toast({ title: 'Geri Alındı', description: 'Bir önceki düzene dönüldü.' });
  }

  const persistPlan = (newObjects: SeatObject[]) => {
    if (!courseId) return;
    // Sessiz arka plan auto-save (UI'yi bloklamaz)
    updateCourse(courseId, { seatingPlan: JSON.stringify(newObjects) }).catch(() => {});
  }

  // Load scores when applicationId is present
  useEffect(() => {
    if (!activeApplicationId) return
    setScoresLoaded(false)
    getScores(activeApplicationId).then((list) => {
      const map: Record<string, Score> = {}
      list.forEach((s) => (map[s.studentId] = s))
      setScores(map)
      setScoresLoaded(true)
    })
  }, [activeApplicationId])

  const handleScoreChange = async (studentId: string, puan: string) => {
    if (!activeApplicationId) return
    const val = puan === '' ? null : Number(puan)
    await setScore(activeApplicationId, studentId, { puan: val })
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], id: studentId, applicationId: activeApplicationId, studentId, puan: val },
    }))
  }

  const handleDevamsizToggle = async (studentId: string) => {
    if (!activeApplicationId) return
    const current = scores[studentId]?.devamsiz ?? false
    const next = !current
    await setScore(activeApplicationId, studentId, { devamsiz: next })
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], id: studentId, applicationId: activeApplicationId, studentId, devamsiz: next },
    }))
  }

  const openCameraForStudent = async (studentId: string) => {
    setCameraOpenFor(studentId)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch {
      toast({ title: 'Hata', description: 'Kamera erişimi reddedildi.', variant: 'destructive' })
      setCameraOpenFor(null)
    }
  }

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOpenFor(null)
  }

  const takePhoto = async () => {
    if (!canvasRef.current || !videoRef.current || !activeApplicationId || !cameraOpenFor) return
    const ctx = canvasRef.current.getContext('2d')!
    canvasRef.current.width = videoRef.current.videoWidth
    canvasRef.current.height = videoRef.current.videoHeight
    ctx.drawImage(videoRef.current, 0, 0)
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return
      uploadStudentPhoto(blob, cameraOpenFor)
    }, 'image/jpeg', 0.85)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, studentId: string) => {
    const file = e.target.files?.[0]
    if (!file || !activeApplicationId) return
    uploadStudentPhoto(file, studentId)
    e.target.value = ''
  }

  const uploadStudentPhoto = async (fileOrBlob: Blob | File, studentId: string) => {
    if (!activeApplicationId) return
    setPhotoUploading(true)
    const tempUrl = URL.createObjectURL(fileOrBlob)
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], kameraFoto: tempUrl },
    }))
    try {
      const key = `applications/${activeApplicationId}/${studentId}.jpg`
      const localUrl = await queueImageUpload(fileOrBlob, key, {
        collection: `courses/${courseId}/applications/${activeApplicationId}/scores`,
        docId: studentId,
        field: 'kameraFoto'
      })
      await setScore(activeApplicationId, studentId, { kameraFoto: localUrl })
      setScores((prev) => ({
        ...prev,
        [studentId]: { ...prev[studentId], kameraFoto: localUrl },
      }))
      closeCamera()
    } catch {
      toast({ title: 'Hata', description: 'Fotoğraf yüklenemedi.', variant: 'destructive' })
    } finally {
      setPhotoUploading(false)
    }
  }

  // Load from firebase (sadece ilk seferde ve sınıfa yeni öğrenci geldiğinde)
  const [initDone, setInitDone] = useState(false);

  useEffect(() => {
    if (!initDone && course && students.length > 0) {
      if (course.seatingPlan) {
        try {
          const parsed = JSON.parse(course.seatingPlan) as SeatObject[]
          let rawObjects = [...parsed];
          
          // --- TEKİLLEŞTİRME (De-duplication) ---
          // Aynı studentId veya linkedStudentId'ye sahip mükerrer nesneleri temizle
          const seenStudentIds = new Set<string>();
          const seenLinkedIds = new Set<string>();
          const uniqueObjects: SeatObject[] = [];

          rawObjects.forEach(obj => {
            if (obj.type === 'student' && obj.studentId) {
              if (seenStudentIds.has(obj.studentId)) return; // Tekrar edeni atla
              seenStudentIds.add(obj.studentId);
            }
            if (obj.type === 'pc_label' && obj.linkedStudentId) {
              if (seenLinkedIds.has(obj.linkedStudentId)) return; // Tekrar edeni atla
              seenLinkedIds.add(obj.linkedStudentId);
            }
            uniqueObjects.push(obj);
          });
          
          let finalObjects = [...uniqueObjects];
          const newStudents = students.filter(s => !seenStudentIds.has(s.id));
          
          newStudents.forEach((s, idx) => {
            finalObjects.push({
              id: uuidv4(),
              type: 'student',
              studentId: s.id,
              x: 1000 - (newStudents.length * 40) + (idx * 80),
              y: 1000,
            });
          });

          const snapped = snapPcLabelsToEdges(finalObjects);
          setObjects(snapped);
          const needsPersist = newStudents.length > 0 ||
            snapped.some((o, i) => o.x !== finalObjects[i].x || o.y !== finalObjects[i].y);
          if (needsPersist) persistPlan(snapped);

        } catch {
          applyClassroomLayout()
        }
      } else {
        applyClassroomLayout()
      }
      setInitDone(true);
    }
  }, [course?.id, students.length, initDone])

  // Öğrenci profilinde pcNo değişirse (Takas dahil) → kanvastaki pc_label nesnelerini senkronize et.
  useEffect(() => {
    if (!initDone || objects.length === 0) return;

    setObjects(prev => {
      // 1. Öğrenci -> Numara haritası
      const pcNoByStudent = new Map<string, string>();
      students.forEach(s => { if (s.id && s.pcNo) pcNoByStudent.set(s.id, s.pcNo); });
      
      // 2. Numara -> ÖğrenciID haritası (Mükerrer kontrolü için)
      const studentByPcNo = new Map<string, string>();
      students.forEach(s => { if (s.id && s.pcNo) studentByPcNo.set(s.pcNo, s.id); });

      let changed = false;
      const updated = prev.map(obj => {
        if (obj.type !== 'pc_label') return obj;

        // Sahip güncellemesi: linkedStudentId üzerinden PC no çek
        if (obj.linkedStudentId) {
          const freshPcNo = pcNoByStudent.get(obj.linkedStudentId);
          if (freshPcNo !== undefined && freshPcNo !== obj.pcNo) {
            changed = true;
            return { ...obj, pcNo: freshPcNo };
          }
        }
        
        // Mükerrer kontrolü: Eğer bu etiket bağlantısızsa ve numarası artık birine atanmışsa temizle
        if (!obj.linkedStudentId && obj.pcNo) {
          if (studentByPcNo.has(obj.pcNo)) {
             changed = true;
             return { ...obj, pcNo: '' };
          }
        }

        return obj;
      });

      if (!changed) return prev;
      persistPlan(updated);
      return updated;
    });
  }, [students, initDone]);


  const applyClassroomLayout = () => {
    pushHistory();
    const newObjects: SeatObject[] = [];

    const baseX = 635;
    const baseY = 750; 

    // En ön sıra y ekseni koordinatı
    const frontRowY = baseY + 4 * 90; 
    // Arada en az 1 öğrenci boyu (70px + tolerans) olacak şelikde önüne koy
    const frontY = frontRowY + 140;

    // En sağ sütun koordinatı: pairIndex(3) * 182 + isRight(1) * 72
    const rightmostStudentX = baseX + 3 * 182 + 72;
    // Masa: Sağdaki öğrenci sütunun tam merkez hizasına
    const masaX = rightmostStudentX + 35 - 60; // 35: öğrenci yarıçapı, 60: masa yarıçapı

    // Tahta: Masanın solunda, arada 2 öğrenci (140px) kadar boşluk
    const tahtaX = masaX - 140 - 200; // 200: tahta genişliği

    newObjects.push({ id: uuidv4(), type: 'tahta', x: tahtaX, y: frontY });
    newObjects.push({ id: uuidv4(), type: 'masa', x: masaX, y: frontY });

    students.forEach((s, index) => {
      // 1. öğrenci sağ alt, 2. yanında. 3. bir arka sıra kenar.
      // Sütun gruplarında geri geri sağdan sola dolum:
      let pairBlock = Math.floor(index / 10); // Her 2'li sütunda 5 satırdan 10 öğrenci
      let pairIndex = 3 - pairBlock; 
      
      // Kapasite(40) aşılırsa, sol sütun blokunda ekstra arka sıralar oluştur
      let inBlockIndex = index % 10;
      let yIndex = 4 - Math.floor(inBlockIndex / 2); // 4 en ön, 0 en arka
      if (pairIndex < 0) {
        pairIndex = 0; 
        yIndex = -1 - Math.floor((index - 40) / 2); // Sola yaslanıp daha arkaya eklenir
      }

      const isRightInPair = 1 - (inBlockIndex % 2); // İlk sağa, sonra sola

      const rx = baseX + pairIndex * 182 + isRightInPair * 72;
      const ry = baseY + yIndex * 90;

      newObjects.push({
        id: uuidv4(),
        type: 'student',
        studentId: s.id,
        x: rx,
        y: ry,
      });
    });
    setObjects(newObjects);
    persistPlan(newObjects);
    setLayoutVersion(v => v + 1);
    toast({ title: 'Düzen Değişti', description: 'Sınıf düzenine geçildi ve otomatik kaydedildi.' });
  }

  const applyLabLayout = () => {
    pushHistory();
    const newObjects: SeatObject[] = [];
    const baseX = 750;
    const baseY = 650;
    const size = 72;

    // Görsele göre Tahta alt kenarda tam ortada (10 satırlık düzene göre)
    const centerLab = baseX + 3.5 * size;
    newObjects.push({ id: uuidv4(), type: 'tahta', x: centerLab - 100, y: baseY + 10 * size + 40 });
    newObjects.push({ id: uuidv4(), type: 'masa', x: centerLab + 150, y: baseY + 10 * size + 40 });

    const spots: {x: number, y: number}[] = [];

    // LAB DÜZENİ: Sol 9, Üst 6 (köşeler hariç), Sağ 9 → Toplam 24
    // 1. Sol sütun: En alttan yukarıya (9 kare, row 9→1)
    for (let row = 9; row >= 1; row--) {
      spots.push({ x: baseX, y: baseY + row * size });
    }
    // 2. Üst sıra: col 1'den col 6'ya (6 kare, köşeler sol/sağa dahil)
    for (let col = 1; col <= 6; col++) {
      spots.push({ x: baseX + col * size, y: baseY });
    }
    // 3. Sağ sütun: Yukarıdan aşağıya (9 kare, row 1→9)
    for (let row = 1; row <= 9; row++) {
      spots.push({ x: baseX + 7 * size, y: baseY + row * size });
    }

    // 4. Orta Ada: Her zaman 6 spot (2 sütun × 3 satır), bitişik, her zaman görünür
    const islandX1 = baseX + 3 * size;  // Sol ada sütunu (ortaya yakın)
    const islandX2 = baseX + 4 * size;  // Sağ ada sütunu (bitişik)
    for (let r = 0; r < 3; r++) {
      spots.push({ x: islandX1, y: baseY + (4 + r) * size }); // Sol ada — bitişik satırlar
      spots.push({ x: islandX2, y: baseY + (4 + r) * size }); // Sağ ada — bitişik satırlar
    }

    // Öğrencileri öğrenci no'suna göre sırala (küçük no → 1. PC)
    const sortedStudents = [...students].sort((a, b) => {
      const numA = parseInt(a.no);
      const numB = parseInt(b.no);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.no.localeCompare(b.no);
    });

    // Tüm spotları (öğrenci + boş sıralar) sırayla işle
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      const pcNo = String(i + 1);
      
      // Pozisyona göre etiketin hangi kenarda duracağını belirle
      let side: PcSnapSide = 'top';
      if (i < 9) side = 'left';          // Sol sütun
      else if (i < 15) side = 'top';     // Üst sıra
      else if (i < 24) side = 'right';   // Sağ sütun
      else {
        // Orta Ada: 24, 26, 28 sol; 25, 27, 29 sağ sütun
        side = (i % 2 === 0) ? 'left' : 'right';
      }

      // Yardımcı fonksiyonu kullanarak koordinatları hesapla
      const tempStudentObj = { x: spot.x, y: spot.y, type: 'student' } as SeatObject;
      const pcPos = getPcSnapPosition(tempStudentObj, side);

      // PC etiketi (tüm spotlar için)
      newObjects.push({
        id: uuidv4(),
        type: 'pc_label',
        pcNo,
        linkedStudentId: i < sortedStudents.length ? sortedStudents[i].id : '', // Boş sıralar için boş string
        x: pcPos.x,
        y: pcPos.y,
      });

      // Bu spot için öğrenci var mı?
      if (i < sortedStudents.length) {
        const s = sortedStudents[i];
        
        // Öğrenci kartı
        newObjects.push({
          id: uuidv4(),
          type: 'student',
          studentId: s.id,
          x: spot.x,
          y: spot.y,
        });

        updateStudent(s.id, { pcNo });
      } else {
        // Boş sıra
        newObjects.push({
          id: uuidv4(),
          type: 'empty_desk',
          x: spot.x,
          y: spot.y,
        });
      }
    }

    setObjects(newObjects);
    persistPlan(newObjects);
    setLayoutVersion(v => v + 1);
    toast({ title: 'Düzen Değişti', description: 'Lab düzenine geçildi ve PC numaraları atandı.' });
  }

  const handleSave = async () => {
    if (!courseId) return
    setSaving(true)
    try {
      await updateCourse(courseId, { seatingPlan: JSON.stringify(objects) })
      toast({ title: 'Başarılı', description: 'Oturma planı kaydedildi.' })
    } catch {
      toast({ title: 'Hata', description: 'Kaydedilirken bir hata oluştu.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (confirm('Tüm oturma planını sıfırlamak ve varsayılan düzene dönmek istediğinize emin misiniz?')) {
      applyClassroomLayout()
    }
  }

  const clearAll = () => {
    if (confirm('Tüm nesneleri (etiketler dahil) temizlemek istiyor musunuz?')) {
      setObjects([]);
      persistPlan([]);
      toast({ title: 'Temizlendi', description: 'Tüm oturma planı nesneleri silindi.' });
    }
  }

  const addEmptyDesk = () => {
    pushHistory();
    setObjects((prev) => [...prev, { id: uuidv4(), type: 'empty_desk', x: 965, y: 965 }])
  }

  const addEmptyObject = () => {
    pushHistory();
    setObjects((prev) => [...prev, { id: uuidv4(), type: 'empty_object', x: 970, y: 1070 }])
  }

  // DND Handlers
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } }) // 0 delay, starts dragging immediately on movement
  )

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string)
    // pc_label sürüklenmeye başlarsa snap target sıfırla
    const obj = objects.find(o => `canvas_${o.id}` === e.active.id);
    if (obj?.type === 'pc_label') {
      pcSnapTargetRef.current = null;
      setPcSnapTarget(null);
    }
  }

  // PC etiketleri ve öğrenci kartları arasındaki mıknatıs yarıçapı (px)
  const PC_HOVER_RADIUS = 80;

  // PC label için en yakın öğrenci kartını bul
  const computePcSnapTarget = (
    labelX: number, labelY: number,
    currentObjects: SeatObject[]
  ): PcSnapTarget => {
    const labelCx = labelX + 30;  // 60 / 2
    const labelCy = labelY + 17;  // 34 / 2
    let closest: { objId: string; dist: number; side: PcSnapSide } | null = null;

    for (const obj of currentObjects) {
      if (obj.type !== 'student') continue;
      const cx = obj.x + 35;
      const cy = obj.y + 35;
      const dist = Math.sqrt((labelCx - cx) ** 2 + (labelCy - cy) ** 2);
      if (dist > PC_HOVER_RADIUS) continue;
      if (closest && dist >= closest.dist) continue;

      const dx = labelCx - cx;
      const dy = labelCy - cy;
      let side: PcSnapSide;
      if (Math.abs(dx) > Math.abs(dy)) {
        side = dx > 0 ? 'right' : 'left';
      } else {
        side = dy > 0 ? 'bottom' : 'top';
      }
      closest = { objId: obj.id, dist, side };
    }
    if (!closest) return null;
    return { studentObjId: closest.objId, side: closest.side };
  };

  // Öğrenci sürüklenirken bir PC etiketine yaklaşıp yaklaşmadığını bul
  const computeStudentToLabelSnapTarget = (
    studentX: number, studentY: number,
    currentObjects: SeatObject[]
  ) => {
    const studentCx = studentX + 35;
    const studentCy = studentY + 35;
    let closest: { labelId: string; side: PcSnapSide; dist: number } | null = null;

    for (const obj of currentObjects) {
      if (obj.type !== 'pc_label') continue;
      
      const labelCx = obj.x + 30;  // 60 / 2
      const labelCy = obj.y + 17;  // 34 / 2
      const dist = Math.sqrt((studentCx - labelCx) ** 2 + (studentCy - labelCy) ** 2);
      
      if (dist > PC_HOVER_RADIUS) continue;
      if (closest && dist >= closest.dist) continue;

      const dx = labelCx - studentCx;
      const dy = labelCy - studentCy;
      let side: PcSnapSide;
      if (Math.abs(dx) > Math.abs(dy)) {
        // labelCx < studentCx (dx negatif) ise etiket soldadır -> sola yapıştır
        side = dx > 0 ? 'right' : 'left';
      } else {
        // labelCy < studentCy (dy negatif) ise etiket üsttedir -> üste yapıştır
        side = dy > 0 ? 'bottom' : 'top'; 
      }
      closest = { labelId: obj.id, side, dist };
    }
    return closest;
  };

  const handleDragMove = (e: DragMoveEvent) => {
    const activeObj = objects.find(o => `canvas_${o.id}` === e.active.id);

    if (activeObj?.type === 'pc_label') {
      // pc_label sürükleniyor: öğrenci kartına snap
      const labelX = activeObj.x + e.delta.x;
      const labelY = activeObj.y + e.delta.y;
      const target = computePcSnapTarget(labelX, labelY, objects);
      if (JSON.stringify(target) !== JSON.stringify(pcSnapTargetRef.current)) {
        pcSnapTargetRef.current = target;
        setPcSnapTarget(target);
      }
      return;
    }

    if (activeObj?.type === 'student') {
      // öğrenci sürükleniyor: pc etiketine snap
      const studentX = activeObj.x + e.delta.x;
      const studentY = activeObj.y + e.delta.y;
      const target = computeStudentToLabelSnapTarget(studentX, studentY, objects);
      const simplifiedTarget = target ? { studentObjId: target.labelId, side: target.side } : null;
      if (JSON.stringify(simplifiedTarget) !== JSON.stringify(pcSnapTargetRef.current)) {
        pcSnapTargetRef.current = simplifiedTarget;
        setPcSnapTarget(simplifiedTarget);
      }
    }

    const unscaledX = e.delta.x;
    const unscaledY = e.delta.y;

    const { guides: newGuides } = getSnapPosition(e.active.id as string, unscaledX, unscaledY, objects);
    
    // Yüksek Performanslı 60fps Kılavuz Çizgileri - React state yerine doğrudan DOM güncellenir (Takılmayı / Stuttering'i önler)
    const guideXEl = document.getElementById('guide-x');
    const guideYEl = document.getElementById('guide-y');
    
    const xGuide = newGuides.find(g => g.axis === 'x');
    if (guideXEl) {
      if (xGuide) {
        guideXEl.style.display = 'block';
        guideXEl.style.left = `${xGuide.pos}px`;
      } else {
        guideXEl.style.display = 'none';
      }
    }

    const yGuide = newGuides.find(g => g.axis === 'y');
    if (guideYEl) {
      if (yGuide) {
        guideYEl.style.display = 'block';
        guideYEl.style.top = `${yGuide.pos}px`;
      } else {
        guideYEl.style.display = 'none';
      }
    }
  }

  // Kenar snap offset hesabı: pc_label'ı öğrenci kartının hangi kenarına yerleştireceğiz
  const getPcSnapPosition = (studentObj: SeatObject, side: PcSnapSide): { x: number; y: number } => {
    const CARD_W = 70, CARD_H = 70;
    const PC_W = 60, PC_H = 34;
    const GAP = 2; // kart kenarından boşluk (px)
    switch (side) {
      case 'top':
        // Yatayda ortala, kartın üstüne 2px boşlukla yerleştir
        return { x: studentObj.x + (CARD_W - PC_W) / 2, y: studentObj.y - PC_H - GAP };
      case 'right':
        // Dikeyde ortala, kartın sağına 2px boşlukla yerleştir
        return { x: studentObj.x + CARD_W + GAP, y: studentObj.y + (CARD_H - PC_H) / 2 };
      case 'bottom':
        // Yatayda ortala, kartın altına 2px boşlukla yerleştir
        return { x: studentObj.x + (CARD_W - PC_W) / 2, y: studentObj.y + CARD_H + GAP };
      case 'left':
        // Dikeyde ortala, kartın soluna 2px boşlukla yerleştir
        return { x: studentObj.x - PC_W - GAP, y: studentObj.y + (CARD_H - PC_H) / 2 };
    }
  };

  // Yüklenen plandaki pc_label'ları linkedStudentId bağlı öğrencilerinin en yakın kenasına çek
  // Eski kayıtlardaki keyfi konumları önler
  const snapPcLabelsToEdges = (objs: SeatObject[]): SeatObject[] => {
    const SIDES: PcSnapSide[] = ['top', 'right', 'bottom', 'left'];
    const studentMap = new Map<string, SeatObject>();
    objs.forEach(o => {
      if (o.type === 'student' && o.studentId) studentMap.set(o.studentId, o);
    });

    return objs.map(obj => {
      if (obj.type !== 'pc_label' || !obj.linkedStudentId) return obj;
      const studentObj = studentMap.get(obj.linkedStudentId);
      if (!studentObj) return obj;

      const PC_W = 60, PC_H = 34;
      const labelCx = obj.x + PC_W / 2;
      const labelCy = obj.y + PC_H / 2;

      let bestSide: PcSnapSide = 'top';
      let bestDist = Infinity;
      for (const side of SIDES) {
        const pos = getPcSnapPosition(studentObj, side);
        const d = Math.hypot(pos.x + PC_W / 2 - labelCx, pos.y + PC_H / 2 - labelCy);
        if (d < bestDist) { bestDist = d; bestSide = side; }
      }

      const snapped = getPcSnapPosition(studentObj, bestSide);
      return { ...obj, x: Math.round(snapped.x), y: Math.round(snapped.y) };
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)

    const guideXEl = document.getElementById('guide-x');
    const guideYEl = document.getElementById('guide-y');
    if (guideXEl) guideXEl.style.display = 'none';
    if (guideYEl) guideYEl.style.display = 'none';

    const canvas = document.getElementById('seating-canvas');
    if (canvas) {
      canvas.style.removeProperty('--drag-x');
      canvas.style.removeProperty('--drag-y');
    }

    const { active, delta } = e
    if (delta.x === 0 && delta.y === 0) {
      // Sürükleme yoksa snap target sıfırla
      pcSnapTargetRef.current = null;
      setPcSnapTarget(null);
      return;
    }

    const activeUUID = (active.id as string).replace('canvas_', '')
    const isGroupDrag = isSelectionMode && selectedIds.includes(activeUUID)

    const activeObj = objects.find(o => `canvas_${o.id}` === active.id);
    const isPcLabel = activeObj?.type === 'pc_label';

    // PC label için snap target'tan pozisyon al (grid snap yok)
    if (isPcLabel && activeObj) {
      const snapTarget = pcSnapTargetRef.current;
      pcSnapTargetRef.current = null;
      setPcSnapTarget(null);

      pushHistory();
      setObjects((prev) => {
        const studentObjForSnap = snapTarget
          ? prev.find(o => o.id === snapTarget.studentObjId)
          : null;

        // Sürüklenen etiketi yeni konuma + linkedStudentId'ye taşı
        const firstPass = prev.map((obj) => {
          if (obj.id !== activeObj.id) return obj;
          if (studentObjForSnap) {
            const pos = getPcSnapPosition(studentObjForSnap, snapTarget!.side);
            return {
              ...obj,
              x: Math.round(pos.x),
              y: Math.round(pos.y),
              linkedStudentId: studentObjForSnap.studentId ?? obj.linkedStudentId,
            };
          }
          return {
            ...obj,
            x: Math.round(obj.x + delta.x),
            y: Math.round(obj.y + delta.y),
          };
        });

        const draggedLabel = firstPass.find(o => o.id === activeObj.id);
        let finalObjects = firstPass;

          // ── linkedStudentId swap + pcNo swap (Firebase) ───────────────────
          if (draggedLabel?.pcNo && studentObjForSnap?.studentId) {
            const targetStudentId = studentObjForSnap.studentId;
            const movingPcNo = draggedLabel.pcNo;

            // 1. Firebase Güncelleme: Tek çağrı yeterli, kanca takası yönetir.
            updateStudent(targetStudentId, { pcNo: movingPcNo });

            // 2. State (Obje) Güncelleme: Tam fiziksel Takas (Swap)
            // Sürüklediğimiz etiketi hedefe bağla, hedefin eski etiketini sürükleyenin eski yerine gönder.
            const oldLinkedStudentId = draggedLabel.linkedStudentId;
            finalObjects = firstPass.map(o => {
              if (o.type !== 'pc_label' || o.id === draggedLabel.id) return o;
              
              if (o.linkedStudentId === targetStudentId) {
                if (oldLinkedStudentId) {
                  const oldStudentObj = prev.find(p => p.studentId === oldLinkedStudentId);
                  if (oldStudentObj) {
                    const pos = getPcSnapPosition(oldStudentObj, 'top');
                    return { ...o, linkedStudentId: oldLinkedStudentId, x: Math.round(pos.x), y: Math.round(pos.y) };
                  }
                }
                return { ...o, linkedStudentId: '' };
              }
              return o;
            });
          }
        // ──────────────────────────────────────────────────────────────────

        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => persistPlan(finalObjects), 800);
        return finalObjects;
      });
      return;
    }

    // Öğrenci sürüklenmişse unlinking veya yeni PC ataması yap
    if (activeObj?.type === 'student') {
      const snapTarget = pcSnapTargetRef.current; // Target aslında pc_label'dır burada
      pcSnapTargetRef.current = null;
      setPcSnapTarget(null);

      // ÖNCE: Merkezler arası snap hesapla (Hizalama bozulmasın)
      const { snapX, snapY } = getSnapPosition(active.id as string, delta.x, delta.y, objects);
      const finalDx = delta.x + snapX;
      const finalDy = delta.y + snapY;

      pushHistory();
      setObjects((prev) => {
        let final = prev.map(o => {
          if (o.id === activeObj.id) {
            return { ...o, x: Math.round(activeObj.x + finalDx), y: Math.round(activeObj.y + finalDy) };
          }
          return o;
        });

        const movedStudent = final.find(o => o.id === activeObj.id);
        if (!movedStudent) return final;

        // EĞER BİR ETİKETE SNAP OLMUŞSA: O etiketi buraya bağla
        if (snapTarget) {
          const targetLabel = final.find(o => o.id === snapTarget.studentObjId);
          if (targetLabel && movedStudent.studentId) {
            const newPos = getPcSnapPosition(movedStudent, snapTarget.side);
            final = final.map(o => {
              if (o.id === targetLabel.id) {
                return { ...o, linkedStudentId: movedStudent.studentId, x: Math.round(newPos.x), y: Math.round(newPos.y) };
              }
              // Eğer bu öğrencinin ESKİ bir etiketi varsa, onu boşa çıkar (çünkü yeni etikete bağlandı)
              if (o.type === 'pc_label' && o.linkedStudentId === movedStudent.studentId && o.id !== targetLabel.id) {
                return { ...o, linkedStudentId: '' };
              }
              return o;
            });
            // Tek bir updateStudent çağrısı yeterli, kanca çakışmayı yönetir
            updateStudent(movedStudent.studentId, { pcNo: targetLabel.pcNo ?? '' });
          }
        } else {
          // SNAP YOKSA: Öğrenciyi eski etiketinden ayır (eğer mesafe yeterince çoksa)
          const currentLabel = final.find(o => o.type === 'pc_label' && o.linkedStudentId === movedStudent.studentId);
          if (currentLabel) {
            const dist = Math.sqrt((movedStudent.x - currentLabel.x)**2 + (movedStudent.y - currentLabel.y)**2);
            if (dist > 150) { 
              final = final.map(o => o.id === currentLabel.id ? { ...o, linkedStudentId: '' } : o);
              if (movedStudent.studentId) updateStudent(movedStudent.studentId, { pcNo: '' });
            }
          }
        }

        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => persistPlan(final), 800);
        return final;
      });
      return;
    }
    const unscaledX = delta.x;
    const unscaledY = delta.y;
    const { snapX, snapY } = getSnapPosition(active.id as string, unscaledX, unscaledY, objects);
    
    const finalDx = unscaledX + snapX;
    const finalDy = unscaledY + snapY;

    pushHistory();

    setObjects((prev) => {
      const updatedObjects = prev.map((obj) => {
        if (isGroupDrag && selectedIds.includes(obj.id)) {
          return { ...obj, x: Math.round(obj.x + finalDx), y: Math.round(obj.y + finalDy) }
        }
        if (`canvas_${obj.id}` === active.id) {
          return { ...obj, x: Math.round(obj.x + finalDx), y: Math.round(obj.y + finalDy) }
        }
        return obj;
      });

      // Debounced persist
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => persistPlan(updatedObjects), 800);
      return updatedObjects;
    })
  }

  // Sayfa yükleniyorsa
  if (courseLoading || studentsLoading) {
    return (
      <Layout title="Oturma Planı Yükleniyor" showBack showLogout={false}>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout title={`${course?.dersAdi} - Oturma Planı`} showBack showLogout={false}>
      <div className="absolute inset-0 top-14 bg-[#e5e7eb] overflow-hidden flex flex-col">
        {/* Canvas Alanı */}
        <div ref={canvasContainerRef} className="flex-1 relative h-full w-full bg-[#cbd5e1]/40 touch-none">
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-slate-900/60 text-white text-[11px] rounded-full backdrop-blur-md font-medium flex items-center gap-2 pointer-events-none shadow-lg transition-all">
            <MousePointer2 className="w-3 h-3" /> Çift parmakla yakınlaştır, objeleri sürükle
          </div>

          {/* Aktif Uygulama Bannerı */}
          {activeApplicationId && (
            <div className="absolute bottom-20 left-4 z-10 bg-green-600/85 backdrop-blur-sm text-white px-3 py-1 rounded-full shadow-md flex items-center gap-1.5 text-[10px] font-bold pointer-events-none">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse shrink-0" />
              <span className="truncate max-w-[140px]">{activeApplicationAd}</span>
            </div>
          )}

          {/* Toplu Seçim Araç Çubuğu */}
          <div className={`absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-4 transition-all duration-300 origin-top ${isSelectionMode ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-8 opacity-0 scale-95 pointer-events-none'}`}>
            <span className="text-[11px] font-semibold">{selectedIds.length} obje seçildi</span>
            <div className="w-px h-4 bg-slate-600" />
            <button onClick={() => { setIsSelectionMode(false); setSelectedIds([]); }} className="text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-colors tracking-widest px-1">
              İPTAL
            </button>
          </div>

          <TransformWrapper
            minScale={0.1}
            maxScale={3}
            initialScale={0.8}
            initialPositionX={0}
            initialPositionY={0}
            centerOnInit={false}
            limitToBounds={false}
            wheel={{ disabled: true }}
            panning={{ disabled: activeId !== null, excluded: ['drv-draggable'] }}
            onTransform={(ref: any) => { scaleRef.current = ref.state.scale; }}
          >
            {(utils: any) => {
              transformUtilsRef.current = utils;
              const calculateClusterCenter = () => {
                // Yalnızca 'student' tipindeki öğrenci objelerini baz al
                const studentsOnly = objects.filter(o => o.type === 'student');
                if (studentsOnly.length === 0) return null;

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                studentsOnly.forEach((obj: SeatObject) => {
                  const { w, h } = getObjectSize(obj.type);
                  if (obj.x < minX) minX = obj.x;
                  if (obj.y < minY) minY = obj.y;
                  if (obj.x + w > maxX) maxX = obj.x + w;
                  if (obj.y + h > maxY) maxY = obj.y + h;
                });
                
                if (minX === Infinity) return null;

                // Home fit hesabı için sınır (bounding box) dolgusu
                const PADDING = window.innerWidth < 600 ? 50 : 100;
                const bbW = maxX - minX + PADDING * 2;
                const bbH = maxY - minY + PADDING * 2;
                const cx = minX - PADDING + bbW / 2;
                const cy = minY - PADDING + bbH / 2;

                // Zoom için öğrenci grubunun %100 saf (dolgu hariç) mutlak merkezini sakla
                const rawCx = minX + (maxX - minX) / 2;
                const rawCy = minY + (maxY - minY) / 2;

                return { cx, cy, bbW, bbH, rawCx, rawCy };
              };

              const handleHome = () => {
                const cluster = calculateClusterCenter();
                if (!cluster) return;

                const wrapperW = window.innerWidth;
                const wrapperH = window.innerHeight - 56;

                const scaleX = wrapperW / cluster.bbW;
                const scaleY = wrapperH / cluster.bbH;
                let idealScale = Math.min(scaleX, scaleY, 1.2); 
                idealScale = Math.max(idealScale, 0.1);

                const tx = wrapperW / 2 - cluster.cx * idealScale;
                const ty = wrapperH / 2 - cluster.cy * idealScale;

                utils.setTransform(tx, ty, idealScale, 300);
              };

              const handleZoomStep = (multiplier: number) => {
                const state = utils.state;
                if (!state) return;
                
                // Ekranın tam merkezi
                const wrapperW = window.innerWidth;
                const wrapperH = window.innerHeight - 56; // Header yüksekliğini çıkar
                const viewCenterX = wrapperW / 2;
                const viewCenterY = wrapperH / 2;

                const currentScale = state.scale;
                const currentTx = state.positionX;
                const currentTy = state.positionY;

                let newScale = currentScale * multiplier;
                newScale = Math.max(0.1, Math.min(newScale, 3));

                // Şu an tam ekran merkezinin altında kalan noktanın saf koordinatlarını bul
                const layoutCx = (viewCenterX - currentTx) / currentScale;
                const layoutCy = (viewCenterY - currentTy) / currentScale;

                // Yeni ölçekte bu noktanın tekrar ekran merkezinde kalması için gereken kaydırmayı (tx/ty) hesapla
                const newTx = viewCenterX - layoutCx * newScale;
                const newTy = viewCenterY - layoutCy * newScale;

                utils.setTransform(newTx, newTy, newScale, 150);
              };

              return (
                <>
                  <AutoFitter onFit={handleHome} loaded={!courseLoading && !studentsLoading && objects.length > 0} layoutVersion={layoutVersion} />
                  
                  {/* Alt Orta Ergonomik Zoom Butonları */}
                  <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-40 flex flex-row items-center pointer-events-auto">
                    <div className="flex flex-row bg-slate-400/20 hover:bg-slate-400/30 backdrop-blur-md border border-slate-400/30 rounded-full overflow-hidden transition-all text-slate-700 shadow-sm">
                      <button onClick={() => handleZoomStep(0.85)} className="w-16 h-12 flex items-center justify-center hover:bg-black/10 transition-all border-r border-slate-400/30" title="Uzaklaştır">
                        <Minus className="w-7 h-7" />
                      </button>
                      <button onClick={() => handleZoomStep(1.15)} className="w-16 h-12 flex items-center justify-center hover:bg-black/10 transition-all" title="Yakınlaştır">
                        <Plus className="w-7 h-7" />
                      </button>
                    </div>
                  </div>

                  {/* Sol Üst Buton Grubu */}
                  <div className="absolute left-4 top-4 z-40 flex flex-row gap-2">
                    <div className="shrink-0 flex flex-row bg-white/70 backdrop-blur-md border border-white/60 shadow-lg rounded-2xl overflow-hidden pointer-events-auto">
                      <button onClick={applyClassroomLayout} className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-white transition-all group border-r border-slate-200/50" title="Sınıf Düzeni">
                        <LayoutGrid className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      </button>
                      <button onClick={applyLabLayout} className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-white transition-all group" title="Lab Düzeni">
                        <Monitor className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      </button>
                    </div>

                    <button disabled={history.length === 0} onClick={handleUndo} className="shrink-0 w-10 h-10 flex items-center justify-center bg-white/70 backdrop-blur-md border border-white/60 shadow-lg rounded-2xl text-slate-800 hover:bg-white transition-all group pointer-events-auto disabled:opacity-50 disabled:cursor-not-allowed" title="Geri Al">
                      <Undo2 className="w-5 h-5 group-hover:-rotate-12 transition-transform" />
                    </button>

                    {/* Araçlar Dropdown */}
                    <div className="relative pointer-events-auto" ref={toolbarRef}>
                      <button onClick={() => setIsToolbarOpen(!isToolbarOpen)} className={`shrink-0 w-10 h-10 flex items-center justify-center backdrop-blur-md shadow-lg rounded-2xl transition-all group ${isToolbarOpen ? 'bg-white border text-primary border-slate-200' : 'bg-white/70 border border-white/60 text-slate-800 hover:bg-white'}`} title="Araçlar">
                        <Wrench className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      </button>

                      {/* Dropdown Menu */}
                      <div className={`absolute top-full mt-2 left-0 transition-all duration-300 ease-out origin-top-left flex flex-col ${isToolbarOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-4 pointer-events-none'}`}>
                        <div className="flex flex-col bg-white/90 backdrop-blur-md border border-slate-200/50 shadow-xl rounded-2xl p-1.5 gap-1 items-stretch w-[140px]">
                           <Button variant="ghost" onClick={addEmptyDesk} className="h-9 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-slate-100 hover:text-slate-800 transition-colors">
                             <Plus className="w-4 h-4 text-slate-500" />
                             <span className="text-[11px] font-bold tracking-wide">SIRA EKLE</span>
                           </Button>

                           <Button variant="ghost" onClick={addEmptyObject} className="h-9 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-slate-100 hover:text-slate-800 transition-colors">
                             <Plus className="w-4 h-4 text-slate-500" />
                             <span className="text-[11px] font-bold tracking-wide">OBJE EKLE</span>
                           </Button>

                           <div className="w-full h-px bg-slate-200/70 my-0.5" />

                           <Button variant="ghost" onClick={applyLabLayout} className="h-9 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-blue-50 hover:text-blue-700 transition-colors">
                             <Monitor className="w-4 h-4" />
                             <span className="text-[11px] font-bold tracking-wide mt-[1px]">LAB DÜZENİ</span>
                           </Button>

                           <Button variant="ghost" onClick={handleReset} disabled={saving} className="h-9 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-red-50 hover:text-red-700 transition-colors">
                             <RotateCcw className="w-4 h-4" />
                             <span className="text-[11px] font-bold tracking-wide mt-[1px]">SIFIRLA</span>
                           </Button>

                           <Button variant="ghost" onClick={clearAll} className="h-9 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-red-50 hover:text-red-700 transition-colors">
                             <Trash2 className="w-4 h-4" />
                             <span className="text-[11px] font-bold tracking-wide mt-[1px]">PLAN TEMİZLE</span>
                           </Button>

                           <Button variant="default" onClick={handleSave} disabled={saving} className="h-9 px-3 flex items-center justify-start gap-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white shadow-md transition-all">
                             {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                             <span className="text-[11px] font-bold tracking-wide mt-[1px]">KAYDET</span>
                           </Button>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={() => {
                        if (isSelectionMode) {
                          setIsSelectionMode(false);
                          setSelectedIds([]);
                        } else {
                          setIsSelectionMode(true);
                        }
                      }} 
                      className={`shrink-0 h-10 px-3 flex items-center gap-2 rounded-2xl backdrop-blur-md shadow-lg transition-all pointer-events-auto border ${
                        isSelectionMode 
                          ? 'bg-primary text-white border-primary active:scale-95' 
                          : 'bg-white/70 border-white/60 text-slate-800 hover:bg-white active:scale-95'
                      }`} 
                      title="Çoklu Seçim Modu"
                    >
                      <MousePointer2 className={`w-4 h-4 ${isSelectionMode ? 'fill-white' : ''}`} />
                      <span className="text-[11px] font-bold tracking-wide">ÇOKLU SEÇİM</span>
                    </button>
                  </div>

                <TransformComponent wrapperClass="w-full h-full" contentClass="w-[2000px] h-[2000px]">
                  
                  <DndContext
                    sensors={sensors}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    modifiers={[customZoomAndSnapModifier]}
                  >
                    <div id="seating-canvas" className="w-[2000px] h-[2000px] bg-slate-50 relative">
                      <DroppableCanvas onClick={() => {
                        if (isSelectionMode) {
                          setIsSelectionMode(false);
                          setSelectedIds([]);
                        }
                      }}>
                        <div id="guide-x" className="absolute top-0 bottom-0 w-[2px] bg-primary/40 -translate-x-1/2 shadow-sm z-40 pointer-events-none" style={{ display: 'none' }} />
                        <div id="guide-y" className="absolute left-0 right-0 h-[2px] bg-primary/40 -translate-y-1/2 shadow-sm z-40 pointer-events-none" style={{ display: 'none' }} />

                        {objects.map((obj) => {
                          const isFollowerDrag = activeId !== null && 
                                                 isSelectionMode && 
                                                 selectedIds.includes(activeId.replace('canvas_', '')) && 
                                                 selectedIds.includes(obj.id) && 
                                                 `canvas_${obj.id}` !== activeId;
                          // PC label sürüklenirken bu student kartı hedef mi?
                          const isPcDragActive = activeId !== null && objects.find(o => `canvas_${o.id}` === activeId)?.type === 'pc_label';
                          const isStudentDragActive = activeId !== null && objects.find(o => `canvas_${o.id}` === activeId)?.type === 'student';

                          const pcSnapSide = (isPcDragActive && obj.type === 'student' && pcSnapTarget?.studentObjId === obj.id)
                            ? pcSnapTarget.side
                            : (isStudentDragActive && obj.type === 'pc_label' && pcSnapTarget?.studentObjId === obj.id)
                               ? 'top' // Etiket seçildiğinde görsel vurgu
                               : undefined;
                          return (
                            <DraggableItem
                              key={obj.id}
                              item={obj}
                              student={obj.type === 'student' ? students.find(s => s.id === obj.studentId) : undefined}
                              isSelectionMode={isSelectionMode}
                              isSelected={selectedIds.includes(obj.id)}
                              isFollowerDrag={isFollowerDrag}
                              scale={scaleRef.current}
                              activeApplicationId={activeApplicationId}
                              score={obj.type === 'student' && obj.studentId ? scores[obj.studentId] : undefined}
                              pcSnapSide={pcSnapSide}
                              onNumpadOpen={(studentId) => setNumpadOpenFor(studentId)}
                              onDevamsizToggle={handleDevamsizToggle}
                              onCameraOpen={openCameraForStudent}
                              onFileUpload={handleFileUpload}
                              onSelectionToggle={() => {
                                setSelectedIds((prev) => 
                                  prev.includes(obj.id) ? prev.filter(id => id !== obj.id) : [...prev, obj.id]
                                )
                              }}
                            />
                          )
                        })}
                      </DroppableCanvas>
                    </div>
                  </DndContext>

                </TransformComponent>
              </>
            );
          }}
          </TransformWrapper>
        </div>
      </div>

      {/* Kamera Dialog - Portal olarak Layout dışında render edilir */}
      {cameraOpenFor && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center gap-4 p-4">
          <video ref={videoRef} autoPlay playsInline className="w-full max-w-sm rounded-2xl bg-black aspect-[4/3] object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex gap-3">
            <button
              onClick={closeCamera}
              className="h-12 px-6 rounded-full bg-white/10 text-white font-bold border border-white/20 hover:bg-white/20 transition-all"
            >
              İptal
            </button>
            <button
              onClick={takePhoto}
              disabled={photoUploading}
              className="h-12 px-8 rounded-full bg-white text-slate-900 font-bold shadow-xl hover:bg-white/90 transition-all active:scale-95 disabled:opacity-50"
            >
              {photoUploading ? 'Yükleniyor...' : 'Fotoğraf Çek'}
            </button>
          </div>
        </div>
      )}

      {/* SmartNumpad */}
      <SmartNumpad
        isOpen={!!numpadOpenFor}
        onClose={() => setNumpadOpenFor(null)}
        value={numpadOpenFor ? (scores[numpadOpenFor]?.puan?.toString() ?? '') : ''}
        student={numpadOpenFor ? (() => { const s = students.find(st => st.id === numpadOpenFor); return s ? { adSoyad: s.adSoyad, no: s.no, foto: s.foto } : undefined })()
          : undefined}
        onChange={(val) => {
          if (numpadOpenFor) handleScoreChange(numpadOpenFor, val)
        }}
      />
    </Layout>
  )
}

function DroppableCanvas({ children, onClick }: { children: React.ReactNode, onClick?: (e: React.MouseEvent) => void }) {
  const { setNodeRef } = useDroppable({ id: 'canvas' })
  return (
    <div ref={setNodeRef} className="absolute inset-0" onClick={(e) => {
      // Sadece doğrudan arka plana tıklandıysa çalıştır
      if (e.target === e.currentTarget && onClick) onClick(e);
    }}>
      {children}
    </div>
  )
}
