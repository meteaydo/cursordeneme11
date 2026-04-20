import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
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
import { Loader2, Save, RotateCcw, Plus, Undo2, Redo2, LayoutPanelTop, Trash2, ZoomIn, ZoomOut, Settings, FileSpreadsheet, Printer } from 'lucide-react'
import { generateSeatingPlanExcel } from '@/services/excelSeatingService'



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

const ClassroomDotsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className}>
    <circle cx="4" cy="6" r="2" />
    <circle cx="12" cy="6" r="2" />
    <circle cx="20" cy="6" r="2" />
    <circle cx="4" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="20" cy="12" r="2" />
    <circle cx="4" cy="18" r="2" />
    <circle cx="12" cy="18" r="2" />
    <circle cx="20" cy="18" r="2" />
  </svg>
)

const LabDotsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className}>
    <circle cx="4.5" cy="6" r="2" />
    <circle cx="9.5" cy="6" r="2" />
    <circle cx="14.5" cy="6" r="2" />
    <circle cx="19.5" cy="6" r="2" />
    <circle cx="4.5" cy="12" r="2" />
    <circle cx="4.5" cy="18" r="2" />
    <circle cx="19.5" cy="12" r="2" />
    <circle cx="19.5" cy="18" r="2" />
  </svg>
)

// Zoom (pinch-zoom) sırasında objelerin sürüklenmesini engellemek için özel TouchSensor
class SmartTouchSensor extends TouchSensor {
  static activator = [
    {
      eventName: 'onTouchStart' as const,
      handler: ({ nativeEvent: event }: { nativeEvent: TouchEvent }) => {
        // Eğer ekranda birden fazla parmak varsa (zoom girişimi), sürükleme hiç başlamasın
        if (event.touches.length > 1) return false;
        return true;
      },
    },
  ];
}

export function SeatingPlanPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const navState = location.state as { applicationId?: string; applicationAd?: string } | null
  
  const { courses, updateCourse, loading: courseLoading } = useCourses()
  const { students, loading: studentsLoading, updateStudent } = useStudents(courseId!)
  const { setScore, getScores } = useApplications(courseId!)

  const course = courses.find((c) => c.id === courseId)

  // -- STATE & REFS --
  const [scores, setScores] = useState<Record<string, Score>>({})
  const [numpadOpenFor, setNumpadOpenFor] = useState<string | null>(null)
  const [cameraOpenFor, setCameraOpenFor] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [initDone, setInitDone] = useState(false);
  const [objects, setObjects] = useState<SeatObject[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [isToolbarOpen, setIsToolbarOpen] = useState(false)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [history, setHistory] = useState<SeatObject[][]>([])
  const [redoHistory, setRedoHistory] = useState<SeatObject[][]>([])
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)

  // Selection DB ID Calculation
  const selectedStudentDBIds = new Set<string>();
  if (isSelectionMode) {
    selectedIds.forEach(sid => {
      const sObj = objects.find(o => o.id === sid && o.type === 'student');
      if (sObj?.studentId) selectedStudentDBIds.add(sObj.studentId);
    });
  }

  // Active application for scoring (from navigation state)
  const activeApplicationId = navState?.applicationId ?? null
  const activeApplicationAd = navState?.applicationAd ?? null


  
  // Layout states
  const [layoutMode, setLayoutMode] = useState<'classroom' | 'lab'>('lab')
  const [layouts, setLayouts] = useState<{ classroom: SeatObject[], lab: SeatObject[] }>({
    classroom: [],
    lab: []
  })

  // Always-current objects ref — stale closure'u önler
  const objectsRef = useRef<SeatObject[]>(objects)
  
  const toolbarMobileRef = useRef<HTMLDivElement>(null)
  const toolbarPcRef = useRef<HTMLDivElement>(null)
  const shareRef = useRef<HTMLDivElement>(null)

  // Tıklama ile açık menüleri kapatma (Toolbar & Share)
  useEffect(() => {
    if (!isToolbarOpen && !isShareOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (isToolbarOpen) {
        const isInsideMobile = toolbarMobileRef.current?.contains(target);
        const isInsidePc = toolbarPcRef.current?.contains(target);
        if (!isInsideMobile && !isInsidePc) {
          setIsToolbarOpen(false);
        }
      }
      if (isShareOpen && shareRef.current && !shareRef.current.contains(target)) {
        setIsShareOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, { capture: true });
    document.addEventListener('touchstart', handleClickOutside, { capture: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, { capture: true });
      document.removeEventListener('touchstart', handleClickOutside, { capture: true });
    };
  }, [isToolbarOpen, isShareOpen]);

  // Zoom ölçeğine göre hareketleri düzenleyen dnd modifier
  // useRef kullanıyoruz — closure stale'ini önler, modifier her zaman güncel scale'i okur
  const scaleRef = useRef(1);
  // Custom wheel zoom için refs
  const transformUtilsRef = useRef<any>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);

  // activeId değiştiğinde ref'i güncelle (wheel closure'da stale olmasın)
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Çift parmak (zoom) başladığı anda sürüklemeyi (aktif veya beklemede) iptal et
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        // dnd-kit dâhili sensorlerini ve bekleyen delay timer'larını iptal etmek için Escape simülasyonu
        window.dispatchEvent(new KeyboardEvent('keydown', { 
          key: 'Escape', 
          code: 'Escape', 
          keyCode: 27, 
          which: 27, 
          bubbles: true 
        }));
      }
    };
    // Capture: true ile her şeyden önce yakalayalım
    window.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    return () => window.removeEventListener('touchstart', handleTouchStart, { capture: true } as any);
  }, []);

  // Custom native wheel handler — milimetrik hassasimette, cursor merkezli zoom
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
    setRedoHistory([]); // Yeni işlem yapıldığında ileri alma geçmişini temizle
  }

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setRedoHistory(prev => [...prev, objects]); // Şu anki hali ileri alma listesine ekle
    setHistory(prev => prev.slice(0, -1));
    setObjects(previousState);
    persistPlan(previousState);
    toast({ title: 'Geri Alındı', description: 'Bir önceki düzene dönüldü.' });
  }

  const handleRedo = () => {
    if (redoHistory.length === 0) return;
    const nextState = redoHistory[redoHistory.length - 1];
    setHistory(prev => [...prev, objects]); // Şu anki hali geri alma listesine ekle
    setRedoHistory(prev => prev.slice(0, -1));
    setObjects(nextState);
    persistPlan(nextState);
    toast({ title: 'İleri Alındı', description: 'Geri alınan düzen tekrar uygulandı.' });
  }

  const persistPlan = (newObjects: SeatObject[], mode: 'classroom' | 'lab' = layoutMode) => {
    if (!courseId) return;

    // Update the layouts state for the current mode
    const updatedLayouts = { ...layouts, [mode]: newObjects };
    setLayouts(updatedLayouts);

    const payload = {
      activeMode: mode,
      classroom: updatedLayouts.classroom,
      lab: updatedLayouts.lab
    };

    updateCourse(courseId, { seatingPlan: JSON.stringify(payload) })
      .then(() => console.log('Plan persisted'))
      .catch((err) => console.error('Plan persist error:', err));
  }

  const switchMode = (newMode: 'classroom' | 'lab') => {
    if (newMode === layoutMode) return;
    
    // Save current objects to current mode's bucket in layouts state
    // We update layouts state and objects state
    const currentObjects = [...objects];
    const newLayouts = { ...layouts, [layoutMode]: currentObjects };
    setLayouts(newLayouts);
    
    // Switch to new mode and load its objects
    setLayoutMode(newMode);
    
    let targetObjects = newLayouts[newMode];
    
    // If target layout is empty, maybe it's the first time?
    if (targetObjects.length === 0) {
      if (newMode === 'classroom') {
        const generated = generateClassroomLayout();
        setObjects(generated);
        persistPlan(generated, 'classroom');
      } else {
        const generated = generateLabLayout();
        setObjects(generated);
        persistPlan(generated, 'lab');
      }
    } else {
      setObjects(targetObjects);
      // Persist the mode change
      persistPlan(targetObjects, newMode);
    }
  }

  // Ref'i her render'da güncelle — timeout callback'i her zaman en son state'i okur
  useEffect(() => {
    objectsRef.current = objects;
  });

  // Auto-save iptal edildi. Yerine sadece unsaved tracking eklendi.
  useEffect(() => {
    if (!initDone) return;
    if (saving) return; // Kayıt yapılıyorsa geçici uyuşmazlığı yoksay

    const currentJSON = JSON.stringify(objectsRef.current);
    const layoutJSON = JSON.stringify(layouts[layoutMode]);

    if (currentJSON !== layoutJSON) {
      setHasUnsavedChanges(true);
    } else {
      setHasUnsavedChanges(false);
    }
  }, [objects, layouts, layoutMode, initDone, saving]);

  // Sayfadan ayrılırken tarayıcı yönlendirme uyarısı (Sekme kapatma vs)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Sayfa içi SPA Geri Dönüşünü kontrol etme
  const handleBackNavigation = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedConfirm(true);
    } else {
      navigate('/courses/' + courseId);
    }
  }

  useEffect(() => {
    if (!activeApplicationId) return
    getScores(activeApplicationId).then((list) => {
      const map: Record<string, Score> = {}
      list.forEach((s) => (map[s.studentId] = s))
      setScores(map)
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

  useEffect(() => {
    if (!initDone && course && students.length > 0) {
      if (course.seatingPlan) {
        try {
          const parsed = JSON.parse(course.seatingPlan)
          let activeMode: 'classroom' | 'lab' = 'classroom'
          let classroom: SeatObject[] = []
          let lab: SeatObject[] = []

          // Handle legacy array format vs new object format
          if (Array.isArray(parsed)) {
            classroom = parsed
            activeMode = 'classroom'
          } else {
            activeMode = parsed.activeMode || 'lab'
            classroom = parsed.classroom || []
            lab = parsed.lab || []
          }

          setLayouts({ classroom, lab })
          setLayoutMode(activeMode)

          let rawObjects = activeMode === 'lab' ? [...lab] : [...classroom];
          
          if (rawObjects.length === 0) {
            if (activeMode === 'classroom') rawObjects = generateClassroomLayout();
            else rawObjects = generateLabLayout();
          }

          // --- TEKİLLEŞTİRME (De-duplication) ---
          const seenStudentIds = new Set<string>();
          const seenLinkedIds = new Set<string>();
          const uniqueObjects: SeatObject[] = [];

          rawObjects.forEach(obj => {
            if (obj.type === 'student' && obj.studentId) {
              if (seenStudentIds.has(obj.studentId)) return;
              seenStudentIds.add(obj.studentId);
            }
            if (obj.type === 'pc_label' && obj.linkedStudentId) {
              if (seenLinkedIds.has(obj.linkedStudentId)) return;
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
          if (needsPersist) persistPlan(snapped, activeMode);

        } catch {
          const generated = generateLabLayout();
          setObjects(generated);
          persistPlan(generated, 'lab');
        }
      } else {
        const generated = generateLabLayout();
        setObjects(generated);
        persistPlan(generated, 'lab');
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
      students.forEach(s => { if (s.id) pcNoByStudent.set(s.id, s.pcNo || ''); });
      
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


  const generateClassroomLayout = () => {
    const newObjects: SeatObject[] = [];
    const baseX = 635;
    const baseY = 750; 
    const frontRowY = baseY + 4 * 90; 
    const frontY = frontRowY + 140;
    const rightmostStudentX = baseX + 3 * 182 + 72;
    const masaX = rightmostStudentX + 35 - 60; 
    const tahtaX = masaX - 140 - 200; 

    newObjects.push({ id: uuidv4(), type: 'tahta', x: tahtaX, y: frontY });
    newObjects.push({ id: uuidv4(), type: 'masa', x: masaX, y: frontY });

    students.forEach((s, index) => {
      let pairBlock = Math.floor(index / 10);
      let pairIndex = 3 - pairBlock; 
      let inBlockIndex = index % 10;
      let yIndex = 4 - Math.floor(inBlockIndex / 2);
      if (pairIndex < 0) {
        pairIndex = 0; 
        yIndex = -1 - Math.floor((index - 40) / 2);
      }
      const isRightInPair = 1 - (inBlockIndex % 2);
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
    return newObjects;
  }

  const generateLabLayout = () => {
    const newObjects: SeatObject[] = [];
    const baseX = 750;
    const baseY = 650;
    const size = 72;
    const spots: {x: number, y: number}[] = [];
    for (let row = 9; row >= 1; row--) spots.push({ x: baseX, y: baseY + row * size });
    for (let col = 1; col <= 6; col++) spots.push({ x: baseX + col * size, y: baseY });
    for (let row = 1; row <= 9; row++) spots.push({ x: baseX + 7 * size, y: baseY + row * size });
    const islandX1 = baseX + 3 * size;
    const islandX2 = baseX + 4 * size;
    for (let r = 0; r < 3; r++) {
      spots.push({ x: islandX1, y: baseY + (4 + r) * size });
      spots.push({ x: islandX2, y: baseY + (4 + r) * size });
    }

    const sortedStudents = [...students].sort((a, b) => {
      const numA = parseInt(a.no);
      const numB = parseInt(b.no);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.no.localeCompare(b.no);
    });

    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      const pcNo = String(i + 1);
      const tempTargetObj = { x: spot.x, y: spot.y, type: 'student' } as SeatObject;
      const pcPos = getPcSnapPosition(tempTargetObj);

      newObjects.push({
        id: uuidv4(),
        type: 'pc_label',
        pcNo,
        linkedStudentId: i < sortedStudents.length ? sortedStudents[i].id : '',
        x: pcPos.x,
        y: pcPos.y,
      });

      if (i < sortedStudents.length) {
        const s = sortedStudents[i];
        newObjects.push({ id: uuidv4(), type: 'student', studentId: s.id, x: spot.x, y: spot.y });
        updateStudent(s.id, { pcNo });
      } else {
        newObjects.push({ id: uuidv4(), type: 'empty_desk', x: spot.x, y: spot.y });
      }
    }
    return newObjects;
  }

  const handleResetLayout = (mode: 'classroom' | 'lab') => {
    const msg = mode === 'classroom' ? 'Sınıf düzeni varsayılana sıfırlanacak. Emin misiniz?' : 'Lab düzeni varsayılana sıfırlanacak. Emin misiniz?';
    if (!confirm(msg)) return;
    
    pushHistory();
    const generated = mode === 'classroom' ? generateClassroomLayout() : generateLabLayout();
    
    if (mode === layoutMode) {
      setObjects(generated);
    }
    
    persistPlan(generated, mode);
    setLayoutVersion(v => v + 1);
    toast({ title: 'Düzen Sıfırlandı', description: 'Seçili düzen varsayılan ayarlara döndürüldü.' });
  }

  const handleSave = async () => {
    if (!courseId) return
    setSaving(true)
    try {
      // Save current objects to current mode
      persistPlan(objects, layoutMode);
      setHasUnsavedChanges(false); // Kayıt başarılı, bayrağı indir
      toast({ title: 'Başarılı', description: 'Oturma planı kaydedildi.' })
    } catch {
      toast({ title: 'Hata', description: 'Kaydedilirken bir hata oluştu.', variant: 'destructive' })
    } finally {
      setSaving(false)
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



  const handleDownloadExcel = async () => {
    if (!course) return;
    try {
      toast({ title: 'Excel Hazırlanıyor', description: 'Oturma planı Excel dosyasına dönüştürülüyor, lütfen bekleyin...' });
      await generateSeatingPlanExcel(objects, students, course.dersAdi, course.sinifAdi);
    } catch (error: any) {
      console.error('Excel export error:', error);
      toast({ 
        title: 'Hata', 
        description: `Oluşturulurken bir hata oluştu: ${error?.message || 'Bilinmeyen hata'}`, 
        variant: 'destructive' 
      });
    }
  }

  // DND Handlers
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(SmartTouchSensor, { 
      activationConstraint: { 
        distance: 5 // Direkt sürüklenme için mesafe sınırı
      } 
    }) 
  )

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string)
  }

  const handleDragMove = (e: DragMoveEvent) => {
    const { guides: newGuides } = getSnapPosition(e.active.id as string, e.delta.x, e.delta.y, objects);
    
    // Yüksek Performanslı 60fps Kılavuz Çizgileri
    const guideXEl = document.getElementById('guide-x');
    const guideYEl = document.getElementById('guide-y');
    
    const xGuide = newGuides.find(g => g.axis === 'x');
    if (guideXEl) {
      if (xGuide) { guideXEl.style.display = 'block'; guideXEl.style.left = `${xGuide.pos}px`; }
      else { guideXEl.style.display = 'none'; }
    }

    const yGuide = newGuides.find(g => g.axis === 'y');
    if (guideYEl) {
      if (yGuide) { guideYEl.style.display = 'block'; guideYEl.style.top = `${yGuide.pos}px`; }
      else { guideYEl.style.display = 'none'; }
    }
  }

  const getPcSnapPosition = (targetObj: SeatObject): { x: number; y: number } => {
    // etiketi objenin tam sol üst köşesine merkeze alacak şekilde yerleştir
    const PC_W = 60, PC_H = 24;
    return { 
      x: targetObj.x - PC_W / 2, 
      y: targetObj.y - PC_H / 2 
    };
  };

  const snapPcLabelsToEdges = (objs: SeatObject[]): SeatObject[] => {
    const studentMap = new Map<string, SeatObject>();
    objs.forEach(o => { 
      if ((o.type === 'student' && o.studentId) || o.type === 'empty_desk') {
        studentMap.set(o.id, o); 
      }
    });

    // Student ID -> Object Map for linked labels
    const studentIdToObjMap = new Map<string, SeatObject>();
    objs.forEach(o => {
      if (o.type === 'student' && o.studentId) studentIdToObjMap.set(o.studentId, o);
    });

    return objs.map(obj => {
      if (obj.type !== 'pc_label') return obj;
      
      let targetObj: SeatObject | undefined;
      
      if (obj.linkedStudentId) {
        targetObj = studentIdToObjMap.get(obj.linkedStudentId);
      } else {
        // En yakın boş sırayı veya öğrenciyi bul (başlangıç için)
        targetObj = Array.from(studentMap.values()).find(s => 
          Math.hypot(s.x - obj.x, s.y - obj.y) < 100
        );
      }

      if (!targetObj) return obj;
      
      const snapped = getPcSnapPosition(targetObj);
      return { ...obj, x: Math.round(snapped.x), y: Math.round(snapped.y) };
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const guideXEl = document.getElementById('guide-x');
    const guideYEl = document.getElementById('guide-y');
    if (guideXEl) { guideXEl.style.display = 'none'; }
    if (guideYEl) { guideYEl.style.display = 'none'; }

    const canvas = document.getElementById('seating-canvas');
    if (canvas) {
      canvas.style.removeProperty('--drag-x');
      canvas.style.removeProperty('--drag-y');
    }

    const { active, delta } = e
    if (delta.x === 0 && delta.y === 0) return;

    const activeUUID = (active.id as string).replace('canvas_', '')
    const isGroupDrag = isSelectionMode && selectedIds.includes(activeUUID)
    const activeObj = objects.find(o => `canvas_${o.id}` === active.id);
    if (!activeObj) return;

    const { snapX, snapY } = getSnapPosition(active.id as string, delta.x, delta.y, objects);
    const finalDx = delta.x + snapX;
    const finalDy = delta.y + snapY;

    pushHistory();

    setObjects((prev) => {
      const movingIds = new Set<string>();

      if (isGroupDrag) {
        // Seçili öğrencilerin DATABASE ID'lerini topla
        const selectedStudentDBIds = new Set<string>();
        selectedIds.forEach(sid => {
          const sObj = prev.find(o => o.id === sid && o.type === 'student');
          if (sObj?.studentId) selectedStudentDBIds.add(sObj.studentId);
        });
        selectedIds.forEach(id => movingIds.add(id));
        // Bu öğrencilere bağlı PC etiketlerini de hareket grubuna dahil et
        prev.forEach(o => {
          if (o.type === 'pc_label' && o.linkedStudentId && selectedStudentDBIds.has(o.linkedStudentId)) {
            movingIds.add(o.id);
          }
        });
      } else {
        movingIds.add(activeObj.id);
        // Tekli sürüklemede de: bu öğrenciye bağlı pc_label'ı birlikte taşı
        if (activeObj.type === 'student' && activeObj.studentId) {
          prev.forEach(o => {
            if (o.type === 'pc_label' && o.linkedStudentId === activeObj.studentId) {
              movingIds.add(o.id);
            }
          });
        }
      }

      const next = prev.map((obj) => {
        if (!movingIds.has(obj.id)) return obj;
        return { ...obj, x: Math.round(obj.x + finalDx), y: Math.round(obj.y + finalDy) };
      });

      return next;
    });
  }

  // Sayfa yükleniyorsa
  if (courseLoading || studentsLoading) {
    return (
      <Layout title="Oturma Planı Yükleniyor" showBack backTitle="Liste Görünümü" showLogout={false}>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout 
      title={
        <div className="flex flex-col items-center">
          <span className="truncate">{course?.dersAdi}</span>
          {activeApplicationId && (
            <div className="mt-0.5 bg-green-600/85 backdrop-blur-sm text-white px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 text-[9px] font-bold">
              <div className="w-1 h-1 bg-white rounded-full animate-pulse shrink-0" />
              <span className="truncate max-w-[120px]">{activeApplicationAd}</span>
            </div>
          )}
        </div>
      }
      showBack 
      backTitle="Liste Görünümü"
      showLogout={false}
      hideTitleOnDesktop={true}
      onBackClick={handleBackNavigation}
      leftExtra={
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-[13px] font-bold text-slate-800 uppercase tracking-[0.15em]">
            {course?.dersAdi}
          </span>
          {activeApplicationId && (
            <div className="bg-green-600/85 backdrop-blur-sm text-white px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 text-[9px] font-bold w-fit">
              <div className="w-1 h-1 bg-white rounded-full animate-pulse shrink-0" />
              <span className="truncate max-w-[120px]">{activeApplicationAd}</span>
            </div>
          )}
        </div>
      }
      rightAction={
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {hasUnsavedChanges && (
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white flex gap-1.5 h-9 items-center rounded-xl px-3 animate-in fade-in zoom-in duration-300 shadow-md shadow-green-600/30"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Save className="w-3.5 h-3.5"/>}
              <span className="text-[10px] font-bold uppercase tracking-wider relative top-[0.5px]">Kaydet</span>
            </Button>
          )}
          <div className="relative pointer-events-auto md:hidden z-[220] overflow-visible" ref={toolbarMobileRef}>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsToolbarOpen(!isToolbarOpen)} 
            className={`text-slate-800 transition-all ${isToolbarOpen ? 'bg-slate-100' : 'hover:bg-slate-100 active:scale-95'}`} 
            title="Ayarlar"
          >
            <Settings className={`w-5 h-5 transition-transform duration-500 ${isToolbarOpen ? 'rotate-90' : ''}`} />
          </Button>

          {/* Ayarlar Dropdown Menu (Mobile Only) */}
          <div className={`absolute top-full mt-2 right-0 z-[210] transition-all duration-300 ease-out origin-top-right flex flex-col ${isToolbarOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-4 pointer-events-none'}`}>
            <div className="flex flex-col bg-white border border-slate-200 shadow-2xl rounded-[24px] p-2 gap-1 items-stretch w-[160px]">
               <Button variant="ghost" onClick={addEmptyDesk} className="h-10 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-slate-100 hover:text-slate-800 transition-colors">
                 <Plus className="w-4 h-4 text-slate-500" />
                 <span className="text-[11px] font-bold tracking-wide uppercase">Sıra Ekle</span>
               </Button>
               <Button variant="ghost" onClick={addEmptyObject} className="h-10 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-slate-100 hover:text-slate-800 transition-colors">
                 <Plus className="w-4 h-4 text-slate-500" />
                 <span className="text-[11px] font-bold tracking-wide uppercase">Obje Ekle</span>
               </Button>
               <div className="w-full h-px bg-slate-100 my-1" />
               <Button variant="ghost" onClick={() => handleResetLayout('classroom')} className="h-10 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-orange-50 hover:text-orange-700 transition-colors">
                  <RotateCcw className="w-4 h-4 opacity-70" />
                  <span className="text-[11px] font-bold tracking-wide uppercase mt-[1px]">Sınıfı Sıfırla</span>
                </Button>
                <Button variant="ghost" onClick={() => handleResetLayout('lab')} className="h-10 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-orange-50 hover:text-orange-700 transition-colors">
                  <RotateCcw className="w-4 h-4 opacity-70" />
                  <span className="text-[11px] font-bold tracking-wide uppercase mt-[1px]">Lab'ı Sıfırla</span>
                </Button>
                <Button variant="ghost" onClick={clearAll} className="h-10 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-red-50 hover:text-red-700 transition-colors">
                  <Trash2 className="w-4 h-4" />
                  <span className="text-[11px] font-bold tracking-wide uppercase mt-[1px]">Hepsini Sil</span>
                </Button>
                <div className="w-full h-px bg-slate-100 my-1" />
                <Button variant="default" onClick={handleSave} disabled={saving} className="h-11 px-3 mt-1 flex items-center justify-start gap-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white shadow-md transition-all">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span className="text-[11px] font-bold tracking-wide uppercase mt-[1px]">Kaydet</span>
                </Button>
            </div>
          </div>
        </div>
        </div>
      }
    >
      <div className="absolute inset-0 top-14 md:top-0 bg-[#e5e7eb] overflow-hidden flex flex-col z-0">
        {/* Canvas Alanı */}
        <div ref={canvasContainerRef} className="flex-1 relative h-full w-full bg-[#e5e7eb] touch-none">


          {/* Aktif Uygulama Bannerı */}

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
                  
                  {/* Üst Sol Buton Grubu */}
                  <div className="absolute left-4 md:left-[50px] md:top-16 top-4 z-40 flex flex-row md:flex-col gap-3">
                    {/* Düzen Butonları (Grup 1) */}
                    <div className="shrink-0 flex flex-row bg-white/80 backdrop-blur-md border border-white/60 shadow-lg rounded-2xl overflow-hidden pointer-events-auto transition-all">
                      <button 
                        onClick={() => switchMode('classroom')} 
                        className={`w-10 h-10 flex items-center justify-center transition-all group border-r border-slate-200/50 ${layoutMode === 'classroom' ? 'bg-primary/10 text-primary' : 'text-slate-800 hover:bg-white'}`} 
                        title="Sınıf Düzeni"
                      >
                        <ClassroomDotsIcon className={`w-5 h-5 group-hover:scale-110 transition-transform ${layoutMode === 'classroom' ? 'opacity-100' : 'opacity-70'}`} />
                      </button>
                      <button 
                        onClick={() => switchMode('lab')} 
                        className={`w-10 h-10 flex items-center justify-center transition-all group ${layoutMode === 'lab' ? 'bg-primary/10 text-primary' : 'text-slate-800 hover:bg-white'}`} 
                        title="Lab Düzeni"
                      >
                        <LabDotsIcon className={`w-5 h-5 group-hover:scale-110 transition-transform ${layoutMode === 'lab' ? 'opacity-100' : 'opacity-70'}`} />
                      </button>
                    </div>

                    {/* Zoom Butonları (Grup 2) */}
                    <div className="shrink-0 flex flex-row bg-white/80 backdrop-blur-md border border-white/60 shadow-lg rounded-2xl overflow-hidden pointer-events-auto transition-all">
                      <button onClick={() => handleZoomStep(0.85)} className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-white transition-all group border-r border-slate-200/50" title="Uzaklaştır">
                        <ZoomOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      </button>
                      <button onClick={() => handleZoomStep(1.15)} className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-white transition-all group" title="Yakınlaştır">
                        <ZoomIn className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      </button>
                    </div>

                    {/* Geçmiş Butonları (Grup 3) */}
                    <div className="shrink-0 flex flex-row bg-white/80 backdrop-blur-md border border-white/60 shadow-lg rounded-2xl overflow-hidden pointer-events-auto transition-all">
                      <button disabled={history.length === 0} onClick={handleUndo} className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-white transition-all group border-r border-slate-200/50 disabled:opacity-50 disabled:cursor-not-allowed" title="Geri Al">
                        <Undo2 className="w-5 h-5 group-hover:-rotate-12 transition-transform" />
                      </button>
                      <button disabled={redoHistory.length === 0} onClick={handleRedo} className="w-10 h-10 flex items-center justify-center text-slate-800 hover:bg-white transition-all group disabled:opacity-50 disabled:cursor-not-allowed" title="İleri Al">
                        <Redo2 className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                      </button>
                    </div>

                      {/* Paylaş Butonu */}
                      <div className="relative pointer-events-auto" ref={shareRef}>
                        <button 
                          onClick={() => setIsShareOpen(!isShareOpen)} 
                          className={`w-10 h-10 flex items-center justify-center bg-white/80 backdrop-blur-md border border-white/60 shadow-lg rounded-2xl text-slate-800 transition-all ${isShareOpen ? 'bg-white' : 'hover:bg-white active:scale-95'}`} 
                          title="Paylaş"
                        >
                          <Printer className={`w-5 h-5 transition-transform duration-300 ${isShareOpen ? 'scale-110 text-primary' : ''}`} />
                        </button>

                        {/* Paylaş Seçenek Kartı */}
                        <div className={`absolute top-full mt-2 right-0 md:top-0 md:left-full md:ml-3 z-[210] transition-all duration-300 ease-out origin-top-right md:origin-left flex flex-col ${isShareOpen ? 'opacity-100 scale-100 translate-y-0 md:translate-x-0' : 'opacity-0 scale-95 -translate-y-4 md:-translate-x-4 pointer-events-none'}`}>
                          <div className="flex flex-col bg-white border border-slate-200 shadow-2xl rounded-[24px] p-2 gap-1 items-stretch w-[170px]">
                            <div className="px-3 py-2 border-b border-slate-50 mb-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sınıf Oturma Planı</span>
                            </div>
                            <Button variant="ghost" onClick={handleDownloadExcel} className="h-10 px-3 flex items-center justify-start gap-3 rounded-xl hover:bg-green-50 hover:text-green-700 transition-all group">
                              <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors">
                                <FileSpreadsheet className="w-4 h-4" />
                              </div>
                              <span className="text-[11px] font-bold tracking-wide uppercase">Excel İndir</span>
                            </Button>

                          </div>
                        </div>
                      </div>

                      {/* Ayarlar Butonu (PC için) */}
                      <div className="hidden md:block relative pointer-events-auto" ref={toolbarPcRef}>
                        <button 
                          onClick={() => setIsToolbarOpen(!isToolbarOpen)} 
                          className={`w-10 h-10 flex items-center justify-center bg-white/80 backdrop-blur-md border border-white/60 shadow-lg rounded-2xl text-slate-800 transition-all ${isToolbarOpen ? 'bg-white' : 'hover:bg-white active:scale-95'}`} 
                          title="Ayarlar"
                        >
                          <Settings className={`w-5 h-5 transition-transform duration-500 ${isToolbarOpen ? 'rotate-90' : ''}`} />
                        </button>

                      {/* Ayarlar Dropdown Menu (PC Only) */}
                      <div className={`absolute top-full mt-2 left-0 z-[210] transition-all duration-300 ease-out origin-top-left flex flex-col ${isToolbarOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-4 pointer-events-none'}`}>
                        <div className="flex flex-col bg-white border border-slate-200 shadow-2xl rounded-[24px] p-2 gap-1 items-stretch w-[160px]">
                           <Button variant="ghost" onClick={addEmptyDesk} className="h-9 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-slate-100 hover:text-slate-800 transition-colors">
                             <Plus className="w-4 h-4 text-slate-500" />
                             <span className="text-[11px] font-bold tracking-wide uppercase">Sıra Ekle</span>
                           </Button>
                           <Button variant="ghost" onClick={addEmptyObject} className="h-9 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-slate-100 hover:text-slate-800 transition-colors">
                             <Plus className="w-4 h-4 text-slate-500" />
                             <span className="text-[11px] font-bold tracking-wide uppercase">Obje Ekle</span>
                           </Button>
                           <div className="w-full h-px bg-slate-100 my-0.5" />
                           <Button variant="ghost" onClick={() => handleResetLayout('classroom')} className="h-9 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-orange-50 hover:text-orange-700 transition-colors">
                              <RotateCcw className="w-4 h-4 opacity-70" />
                              <span className="text-[11px] font-bold tracking-wide uppercase mt-[1px]">Sınıfı Sıfırla</span>
                            </Button>
                            <Button variant="ghost" onClick={() => handleResetLayout('lab')} className="h-9 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-orange-50 hover:text-orange-700 transition-colors">
                              <RotateCcw className="w-4 h-4 opacity-70" />
                              <span className="text-[11px] font-bold tracking-wide uppercase mt-[1px]">Lab'ı Sıfırla</span>
                            </Button>
                            <Button variant="ghost" onClick={clearAll} className="h-9 px-3 flex items-center justify-start gap-2.5 rounded-xl hover:bg-red-50 hover:text-red-700 transition-colors">
                              <Trash2 className="w-4 h-4" />
                              <span className="text-[11px] font-bold tracking-wide uppercase mt-[1px]">Hepsini Sil</span>
                            </Button>
                            <div className="w-full h-px bg-slate-100 my-0.5" />
                            <Button variant="default" onClick={handleSave} disabled={saving} className="h-9 px-3 mt-1 flex items-center justify-start gap-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white shadow-md transition-all">
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              <span className="text-[11px] font-bold tracking-wide uppercase mt-[1px]">Kaydet</span>
                            </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Çoklu Seçim Araç Çubuğu */}
                  <div className={`absolute md:top-6 top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md border border-slate-700 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-4 transition-all duration-300 origin-top ${isSelectionMode ? 'translate-y-4 opacity-100 scale-100' : '-translate-y-8 opacity-0 scale-95 pointer-events-none'}`}>
                    <span className="text-[11px] font-semibold">{selectedIds.length} obje seçildi</span>
                    <div className="w-px h-4 bg-slate-600" />
                    <button onClick={() => { setIsSelectionMode(false); setSelectedIds([]); }} className="text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-colors tracking-widest px-1">
                      İPTAL
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
                    <div id="seating-canvas" className="w-[2000px] h-[2000px] bg-[#e5e7eb] relative">
                      <DroppableCanvas onClick={() => {
                        if (isSelectionMode) {
                          setIsSelectionMode(false);
                          setSelectedIds([]);
                        }
                      }}>
                        <div id="guide-x" className="absolute top-0 bottom-0 w-[2px] bg-primary/40 -translate-x-1/2 shadow-sm z-40 pointer-events-none" style={{ display: 'none' }} />
                        <div id="guide-y" className="absolute left-0 right-0 h-[2px] bg-primary/40 -translate-y-1/2 shadow-sm z-40 pointer-events-none" style={{ display: 'none' }} />

                        {(() => {
                          // Grup sürüklemede, hangi öğrencilerin seçili olduğunu bul
                          const selectedStudentDBIds = new Set<string>();
                          selectedIds.forEach(sid => {
                            const sObj = objects.find(o => o.id === sid && o.type === 'student');
                            if (sObj?.studentId) selectedStudentDBIds.add(sObj.studentId);
                          });

                          // Tekli sürüklemede aktif öğrenci
                          const activeUUID = activeId?.replace('canvas_', '');
                          const isMainDraggingSelected = !!(activeId !== null && isSelectionMode && activeUUID && selectedIds.includes(activeUUID));
                          const draggingStudentObj = activeId && !isMainDraggingSelected
                            ? objects.find(o => `canvas_${o.id}` === activeId && o.type === 'student')
                            : null;

                          return objects.map((obj) => {
                            let isFollowerDrag = false;

                            if (isMainDraggingSelected) {
                              // Grup taşıma: seçili objeler veya bağlı pc_label'lar takip eder
                              isFollowerDrag = selectedIds.includes(obj.id) && `canvas_${obj.id}` !== activeId;
                              if (!isFollowerDrag && obj.type === 'pc_label' && obj.linkedStudentId) {
                                if (selectedStudentDBIds.has(obj.linkedStudentId)) isFollowerDrag = true;
                              }
                            } else if (draggingStudentObj && obj.type === 'pc_label') {
                              // Tekli taşıma: öğrenciye bağlı pc_label takip eder
                              if (obj.linkedStudentId === draggingStudentObj.studentId) isFollowerDrag = true;
                            }

                            return (
                              <DraggableItem
                                key={obj.id}
                                item={obj}
                                student={obj.type === 'student' ? students.find(s => s.id === obj.studentId) : undefined}
                                studentsList={students}
                                updateStudentData={updateStudent}
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedIds.includes(obj.id)}
                                isFollowerDrag={isFollowerDrag}
                                activeApplicationId={activeApplicationId}
                                score={obj.type === 'student' && obj.studentId ? scores[obj.studentId] : undefined}
                                onNumpadOpen={(studentId) => setNumpadOpenFor(studentId)}
                                onDevamsizToggle={handleDevamsizToggle}
                                onCameraOpen={openCameraForStudent}
                                onFileUpload={handleFileUpload}
                                onSelectionToggle={() => {
                                  if (!isSelectionMode) setIsSelectionMode(true);
                                  setSelectedIds((prev) =>
                                    prev.includes(obj.id) ? prev.filter(id => id !== obj.id) : [...prev, obj.id]
                                  )
                                }}
                              />
                            )
                          })
                        })()}


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

      {/* Kaydedilmemiş Değişiklikler Modalı */}
      <UnsavedConfirmModal 
        isOpen={showUnsavedConfirm}
        onClose={() => setShowUnsavedConfirm(false)}
        onConfirm={() => {
          setShowUnsavedConfirm(false);
          navigate('/courses/' + courseId);
        }}
      />
    </Layout>
  )
}


function UnsavedConfirmModal({ isOpen, onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: () => void }) {
  if (!isOpen) return null;
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={onClose} />
      <div className="bg-white rounded-[32px] shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden relative animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="p-8 flex flex-col items-center text-center gap-6">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center">
            <LayoutPanelTop className="w-8 h-8 text-amber-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-800">Kaydetmeden Çık?</h3>
            <p className="text-sm text-slate-500 leading-relaxed px-4">
              Kaydedilmemiş değişiklikleriniz var. Sayfadan ayrılırsanız bu değişiklikler kaybolacaktır.
            </p>
          </div>
          <div className="flex flex-col w-full gap-3 mt-2">
            <Button 
              onClick={onConfirm}
              className="h-12 w-full bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-200 active:scale-95 transition-all"
            >
              Kaydetmeden Çık
            </Button>
            <Button 
              variant="ghost"
              onClick={onClose}
              className="h-12 w-full text-slate-500 font-bold rounded-2xl hover:bg-slate-50 active:scale-95 transition-all"
            >
              Vazgeç
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
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
