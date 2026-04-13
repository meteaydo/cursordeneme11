import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Camera, X, Loader2, User, Upload, Check, WifiOff, AlertCircle, Trash2, Pencil, Star, StarOff, Plus, ChevronDown
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useStudents } from '@/hooks/useStudents'
import { useApplications } from '@/hooks/useApplications'
import { useCourses } from '@/hooks/useCourses'
import { useAutoSave } from '@/hooks/useAutoSave'
import { queueImageUpload } from '@/lib/imageQueue'
import { OfflineImage } from '@/components/ui/OfflineImage'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { toast } from '@/hooks/use-toast'
import type { StudentFormData } from '@/types'
import { uploadToR2 } from '@/lib/r2'
import imageCompression from 'browser-image-compression'

const LONG_PRESS_MS = 200
const MOVE_THRESHOLD = 5

type CameraMode = 'profile' | 'notes' | 'behavior'

export default function StudentProfilePage() {
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>()
  const navigate = useNavigate()
  const cId = courseId!
  const sId = studentId!

  const { students, updateStudent, deleteStudent, addBehaviorStar, deleteBehaviorLog, updateBehaviorLog } = useStudents(cId)
  const { applications, getScores } = useApplications(cId)
  const { courses } = useCourses()

  const student = students.find((s) => s.id === sId)
  const course = courses.find((c) => c.id === cId)

  const [form, setForm] = useState<StudentFormData | null>(null)
  const [pcDragReady, setPcDragReady] = useState(false)
  const [pcDragging, setPcDragging] = useState(false)
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 })
  const [isDragOver, setIsDragOver] = useState(false)
  const [chartData, setChartData] = useState<{ name: string; puan: number | null }[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [notePhotoToDeleteIdx, setNotePhotoToDeleteIdx] = useState<number | null>(null)

  // Behavior states
  const [behaviorNote, setBehaviorNote] = useState('')
  const [behaviorPhotoBlobs, setBehaviorPhotoBlobs] = useState<(Blob | File)[]>([])
  const [behaviorPhotoUrls, setBehaviorPhotoUrls] = useState<string[]>([])
  const [behaviorSaving, setBehaviorSaving] = useState(false)
  const [zoomedBehaviorPhotoIndex, setZoomedBehaviorPhotoIndex] = useState<number | null>(null)
  const [zoomedListPhotoId, setZoomedListPhotoId] = useState<string | null>(null)
  const [isBehaviorFormOpen, setIsBehaviorFormOpen] = useState(false)
  const [behaviorToDelete, setBehaviorToDelete] = useState<any | null>(null)
  const [editingBehaviorLog, setEditingBehaviorLog] = useState<any | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const behaviorDropdownRef = useRef<HTMLDivElement>(null)

  // Click outside listener for behavior dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (behaviorDropdownRef.current && !behaviorDropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Behavior options
  const behaviorOptions = [
    { value: '1', label: '1) Ders içi katılım (Madde 50/1)', color: 'green' },
    { value: '2', label: '2) Akran yardımı (Madde 158/1-b)', color: 'green' },
    { value: '3', label: '3) Sosyal faaliyet (Madde 50/8)', color: 'green' },
    { value: '4', label: '4) Örnek davranış (Madde 158/1-a)', color: 'green' },
    { value: '5', label: '5) Okul forması yok (Madde 164/1-a)', color: 'pink' },
    { value: '6', label: '6) Dersi bölme (konuşma vs) (Madde 164/1-ç)', color: 'pink' },
    { value: '7', label: '7) İzinsiz yer değişikliği (Madde 164/1-a)', color: 'pink' },
    { value: '8', label: '8) Çevreyi kirletme (Madde 164/1-f)', color: 'pink' },
    { value: '9', label: '9) Ders dışı PC kullanımı (Madde 164/1-p)', color: 'pink' },
    { value: '10', label: '10) Derste uyuma (Madde 50/8)', color: 'pink' },
    { value: '11', label: '11) Labda Yemek/İçmek (Madde 164/1-f)', color: 'pink' },
    { value: '12', label: '12) Argo kullanımı (Madde 164/1-ç)', color: 'pink' },
    { value: '13', label: '13) Donanıma Kötü Davranma (Madde 164/1-j)', color: 'pink' },
    { value: '14', label: '14) İntihal/Hazıra Konma (Madde 164/1-n)', color: 'pink' },
    { value: 'custom', label: 'Özel giriş...', color: 'gray' },
  ]

  // Determine behavior type based on selected note
  const getBehaviorType = (note: string): 'yellow' | 'purple' | null => {
    if (!note) return null
    const option = behaviorOptions.find(opt => opt.label === note)
    if (!option) return null // custom entry, unknown
    return option.color === 'green' ? 'yellow' : 'purple'
  }

  const pcInputRef = useRef<HTMLInputElement>(null)
  const pcWrapRef = useRef<HTMLDivElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPos = useRef({ x: 0, y: 0 })
  const pIdRef = useRef<number | null>(null)

  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  const handlePcPointerDown = (e: React.PointerEvent) => {
    if (!form?.pcNo) return
    startPos.current = { x: e.clientX, y: e.clientY }
    setGhostPos({ x: e.clientX, y: e.clientY })
    longPressTimer.current = setTimeout(() => {
      pcInputRef.current?.blur()
      pIdRef.current = e.pointerId
      pcWrapRef.current?.setPointerCapture(e.pointerId)
      setPcDragReady(true)
      navigator.vibrate?.(30)
    }, LONG_PRESS_MS)
  }

  const handlePcPointerMove = (e: React.PointerEvent) => {
    if (!pcDragReady && longPressTimer.current) {
      if (Math.abs(e.clientX - startPos.current.x) > MOVE_THRESHOLD || Math.abs(e.clientY - startPos.current.y) > MOVE_THRESHOLD) {
        cancelLongPress()
      }
      return
    }
    if (!pcDragReady) return
    setPcDragging(true)
    setGhostPos({ x: e.clientX, y: e.clientY })
    const dz = dropZoneRef.current
    if (dz) {
      const r = dz.getBoundingClientRect()
      setIsDragOver(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
    }
  }

  const handlePcPointerUp = () => {
    cancelLongPress()
    if (pIdRef.current !== null) {
      try { pcWrapRef.current?.releasePointerCapture(pIdRef.current) } catch { /* */ }
      pIdRef.current = null
    }
    if (pcDragReady && isDragOver && form?.pcNo) {
      setForm({ ...form, eskiPcNolari: [form.pcNo, ...form.eskiPcNolari.filter((p) => p !== form.pcNo)] })
    }
    setPcDragReady(false)
    setPcDragging(false)
    setIsDragOver(false)
  }

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraMode, setCameraMode] = useState<CameraMode>('profile')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [notesPhotoUploading, setNotesPhotoUploading] = useState(false)
  const [isProfileZoomed, setIsProfileZoomed] = useState(false)
  const [zoomedNotePhotoIndex, setZoomedNotePhotoIndex] = useState<number | null>(null)
  const [editingField, setEditingField] = useState<'adSoyad' | 'no' | null>(null)

  useEffect(() => {
    if (student && !form) {
      setForm({
        no: student.no,
        adSoyad: student.adSoyad,
        pcNo: student.pcNo,
        eskiPcNolari: student.eskiPcNolari ?? [],
        ozelDurumNotlari: student.ozelDurumNotlari ?? '',
        ozelDurumFotolari: student.ozelDurumFotolari ?? [],
        bep: student.bep ?? false,
        bepNotu: student.bepNotu ?? '',
        bepPlaniYapildi: student.bepPlaniYapildi ?? false,
        foto: student.foto ?? '',
      })
    }
  }, [student])

  useEffect(() => {
    if (!applications.length) return
    setChartLoading(true)
    Promise.all(applications.map((a) => getScores(a.id))).then((allScores) => {
      const data = applications.map((a, i) => {
        const sc = allScores[i].find((s) => s.studentId === sId)
        return {
          name: format(new Date(a.tarih + 'T12:00:00'), 'd MMM', { locale: tr }),
          puan: sc?.puan ?? null,
        }
      }).filter((d) => d.puan !== null).reverse()
      setChartData(data as { name: string; puan: number | null }[])
      setChartLoading(false)
    })
  }, [applications, sId])

  const saveFn = useCallback(
    (data: StudentFormData) => updateStudent(sId, data),
    [sId, updateStudent],
  )
  const { status: autoSaveStatus } = useAutoSave(form, saveFn)

  const removeOldPc = (idx: number) => {
    if (!form) return
    setForm({ ...form, eskiPcNolari: form.eskiPcNolari.filter((_, i) => i !== idx) })
  }

  // --- Kamera ---
  const openCamera = async (mode: CameraMode) => {
    setCameraMode(mode)
    setCameraOpen(true)
    try {
      const facingMode = mode === 'profile' ? 'user' : 'environment'
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch {
      toast({ title: 'Hata', description: 'Kamera erişimi reddedildi.', variant: 'destructive' })
      setCameraOpen(false)
    }
  }

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOpen(false)
  }

  const takePhoto = async () => {
    if (!canvasRef.current || !videoRef.current || !form) return
    const ctx = canvasRef.current.getContext('2d')!
    canvasRef.current.width = videoRef.current.videoWidth
    canvasRef.current.height = videoRef.current.videoHeight
    ctx.drawImage(videoRef.current, 0, 0)
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return
      if (cameraMode === 'profile') uploadProfilePhoto(blob)
      else if (cameraMode === 'notes') uploadNotePhoto(blob)
      else if (cameraMode === 'behavior') {
        const url = URL.createObjectURL(blob)
        setBehaviorPhotoUrls(prev => [...prev, url])
        setBehaviorPhotoBlobs(prev => [...prev, blob])
        closeCamera()
      }
    }, 'image/jpeg', 0.85)
  }

  const handleBehaviorFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const newUrls = files.map(f => URL.createObjectURL(f))
    setBehaviorPhotoUrls(prev => [...prev, ...newUrls])
    setBehaviorPhotoBlobs(prev => [...prev, ...files])
  }

  const removeBehaviorPhoto = (idx: number) => {
    setBehaviorPhotoUrls(prev => prev.filter((_, i) => i !== idx))
    setBehaviorPhotoBlobs(prev => prev.filter((_, i) => i !== idx))
  }

  const handleEditBehaviorClick = (log: any) => {
    setEditingBehaviorLog(log)
    setBehaviorNote(log.note)
    setBehaviorPhotoUrls(log.photoUrls || (log.photoUrl ? [log.photoUrl] : []))
    setBehaviorPhotoBlobs([])
    setIsBehaviorFormOpen(true)
  }

  const resetBehaviorForm = () => {
    setBehaviorNote('')
    setBehaviorPhotoBlobs([])
    behaviorPhotoUrls.filter(u => u.startsWith('blob:')).forEach(URL.revokeObjectURL)
    setBehaviorPhotoUrls([])
    setEditingBehaviorLog(null)
    setIsBehaviorFormOpen(false)
  }

  const handleAutoSaveBehavior = async (specificNote?: string, forcedType?: 'yellow' | 'purple') => {
    const noteToSave = specificNote ?? behaviorNote
    if (!noteToSave.trim()) return // boşsa kaydetme

    setBehaviorSaving(true)
    const finalPhotoUrls: string[] = []
    
    // Type belirlenmesi: 
    // 1. forcedType (butonla basıldıysa)
    // 2. getBehaviorType (listedeyse)
    // 3. 'yellow' (listedışı manuel giriş butona basılmadıysa enter vs ise)
    let determinedType: 'yellow' | 'purple' = 'yellow'
    if (forcedType) {
      determinedType = forcedType
    } else {
      const detectedType = getBehaviorType(noteToSave)
      if (detectedType) determinedType = detectedType
    }

    try {
      const existingUrls = behaviorPhotoUrls.filter(url => !url.startsWith('blob:'))
      finalPhotoUrls.push(...existingUrls)

      if (behaviorPhotoBlobs.length > 0) {
        const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1280, useWebWorker: true }
        for (let i = 0; i < behaviorPhotoBlobs.length; i++) {
          const blob = behaviorPhotoBlobs[i]
          const fileToCompress = blob instanceof File
            ? blob
            : new File([blob], 'image.jpg', { type: blob.type || 'image/jpeg' })

          const compressedFile = await imageCompression(fileToCompress, options)
          const key = `students/${sId}/behavior/${Date.now()}_${i}.jpg`

          const url = await uploadToR2(compressedFile, key)
          finalPhotoUrls.push(url)
        }
      }

      if (editingBehaviorLog) {
        const updatedLog = {
          ...editingBehaviorLog,
          type: determinedType,
          note: noteToSave,
          photoUrls: finalPhotoUrls,
          photoUrl: finalPhotoUrls[0] || undefined
        }
        await updateBehaviorLog(sId, editingBehaviorLog, updatedLog)
      } else {
        await addBehaviorStar(sId, determinedType, noteToSave, finalPhotoUrls)
      }

      resetBehaviorForm()
      toast({ title: 'Başarılı', description: 'Davranış değerlendirmesi kaydedildi.' })
    } catch {
      toast({ title: 'Hata', description: 'Davranış kaydedilirken bir hata oluştu.', variant: 'destructive' })
    } finally {
      setBehaviorSaving(false)
    }
  }


  const handleDeleteBehaviorLog = async () => {
    if (!behaviorToDelete) return
    try {
      await deleteBehaviorLog(sId, behaviorToDelete)
      toast({ title: 'Başarılı', description: 'Davranış kaydı silindi.' })
    } catch {
      toast({ title: 'Hata', description: 'Kayıt silinirken bir hata oluştu.', variant: 'destructive' })
    } finally {
      setBehaviorToDelete(null)
    }
  }

  // --- Profil fotoğrafı ---
  const handleProfileFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !form) return
    uploadProfilePhoto(file)
  }

  const uploadProfilePhoto = async (fileOrBlob: Blob | File) => {
    if (!form) return
    setPhotoUploading(true)

    // Anında gösterim için geçici URL oluştur
    const tempUrl = URL.createObjectURL(fileOrBlob)
    setForm((prev) => prev ? { ...prev, foto: tempUrl } : null)

    try {
      const key = `students/${sId}/foto.jpg`
      const localUrl = await queueImageUpload(fileOrBlob, key, {
        collection: `courses/${cId}/students`,
        docId: sId,
        field: 'foto'
      })
      setForm((prev) => prev ? { ...prev, foto: localUrl } : null)
      closeCamera()
    } catch {
      toast({ title: 'Hata', description: 'Fotoğraf yüklenemedi.', variant: 'destructive' })
    } finally {
      setPhotoUploading(false)
    }
  }

  // --- Özel durum notları fotoğrafı ---
  const handleNotesFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !form) return
    uploadNotePhoto(file)
  }

  const uploadNotePhoto = async (fileOrBlob: Blob | File) => {
    if (!form) return
    setNotesPhotoUploading(true)

    // Anında gösterim için geçici URL oluştur
    const tempUrl = URL.createObjectURL(fileOrBlob)
    setForm((prev) => prev ? { ...prev, ozelDurumFotolari: [...(prev.ozelDurumFotolari ?? []), tempUrl] } : null)

    try {
      const key = `students/${sId}/notlar/${Date.now()}.jpg`
      const localUrl = await queueImageUpload(fileOrBlob, key, {
        collection: `courses/${cId}/students`,
        docId: sId,
        field: 'ozelDurumFotolari',
        isArray: true
      })

      // Geçici URL'i kalıcı URL ile değiştir
      setForm((prev) => {
        if (!prev) return null
        const newList = [...(prev.ozelDurumFotolari ?? [])]
        const tempIdx = newList.indexOf(tempUrl)
        if (tempIdx !== -1) {
          newList[tempIdx] = localUrl
        } else {
          newList.push(localUrl)
        }
        return { ...prev, ozelDurumFotolari: newList }
      })
      closeCamera()
    } catch {
      toast({ title: 'Hata', description: 'Fotoğraf yüklenemedi.', variant: 'destructive' })
    } finally {
      setNotesPhotoUploading(false)
    }
  }

  const removeNotePhoto = (idx: number) => {
    if (!form) return
    setForm({ ...form, ozelDurumFotolari: (form.ozelDurumFotolari ?? []).filter((_, i) => i !== idx) })
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteStudent(sId)
      // Modalı güvenli bir şekilde kapatıp kısa bir gecikme ile listeye dön
      setDeleteDialogOpen(false)
      setTimeout(() => {
        navigate(`/courses/${cId}`)
      }, 100)
    } catch {
      toast({ title: 'Hata', description: 'Öğrenci silinirken bir hata oluştu.', variant: 'destructive' })
      setIsDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  if (!student || !form) {
    return (
      <Layout title="Öğrenci Profili" showBack showLogout={false}>
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout title="Öğrenci Profili" showBack showLogout={false}>
      {autoSaveStatus !== 'idle' && (
        <div className="fixed top-4 right-4 z-50 pointer-events-none">
          {autoSaveStatus === 'saving' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background border border-border px-3 py-1 text-xs text-muted-foreground shadow-md">
              <Loader2 className="h-3 w-3 animate-spin" />
              Kaydediliyor...
            </span>
          )}
          {autoSaveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs text-green-700 shadow-md">
              <Check className="h-3 w-3" />
              Kaydedildi
            </span>
          )}
          {autoSaveStatus === 'offline-saved' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs text-orange-700 shadow-md">
              <WifiOff className="h-3 w-3" />
              Çevrimdışı kaydedildi
            </span>
          )}
          {autoSaveStatus === 'error' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs text-red-700 shadow-md">
              <AlertCircle className="h-3 w-3" />
              Kayıt hatası
            </span>
          )}
        </div>
      )}

      <div className="space-y-4">
        {/* Profil Fotoğrafı */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="relative mb-2">
            <div
              className={`w-24 h-24 flex items-center justify-center border-2 border-primary/20 transition-all duration-300 origin-top ${isProfileZoomed ? 'scale-[3] z-50 shadow-xl relative rounded-md overflow-hidden bg-background cursor-zoom-out' : 'rounded-full overflow-hidden bg-primary/10 cursor-zoom-in'}`}
              onClick={() => setIsProfileZoomed(!isProfileZoomed)}
              title={isProfileZoomed ? "Küçült" : "Büyüt"}
            >
              {form.foto ? (
                <OfflineImage src={form.foto} alt={form.adSoyad} className="w-full h-full object-cover" />
              ) : (
                <User className={`text-primary/50 ${isProfileZoomed ? 'h-6 w-6' : 'h-10 w-10'}`} />
              )}
            </div>
            <div className={`flex gap-1.5 absolute -bottom-3 left-1/2 -translate-x-1/2 transition-opacity ${isProfileZoomed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <button
                onClick={() => openCamera('profile')}
                className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors"
                title="Kamera ile çek"
              >
                {photoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <label className="w-8 h-8 bg-white text-primary border border-primary rounded-full flex items-center justify-center shadow-md hover:bg-accent transition-colors cursor-pointer" title="Dosyadan yükle">
                <Upload className="h-4 w-4" />
                <input type="file" accept="image/*" className="hidden" onChange={handleProfileFileUpload} />
              </label>
            </div>
          </div>
          <div className="text-center flex flex-col items-center gap-0.5 w-full max-w-xs px-4">
            {/* Ad Soyad */}
            {editingField === 'adSoyad' ? (
              <div className="flex items-center justify-center gap-1 w-full">
                <Input
                  autoFocus
                  value={form.adSoyad}
                  onChange={(e) => setForm({ ...form, adSoyad: e.target.value })}
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
                  className="text-center font-semibold h-8"
                />
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditingField(null)}>
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <div
                  className="group flex items-center justify-center gap-1.5 cursor-pointer hover:bg-accent/50 py-1 px-2 rounded-md transition-colors"
                  onClick={() => setEditingField('adSoyad')}
                >
                  <h2 className="font-semibold text-[1.1rem] leading-none">{form.adSoyad || 'İsimsiz Öğrenci'}</h2>
                  <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Davranış Rozetleri */}
                <div className="flex items-center gap-1.5 justify-center">
                  {(student.behaviorStars?.yellow ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded-full border border-yellow-200">
                      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-500" />
                      x{student.behaviorStars!.yellow}
                    </span>
                  )}
                  {(student.behaviorStars?.purple ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full border border-purple-200">
                      <StarOff className="w-3.5 h-3.5 text-purple-500" />
                      x{student.behaviorStars!.purple}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* No */}
            {editingField === 'no' ? (
              <div className="flex items-center justify-center gap-1 w-full">
                <Input
                  autoFocus
                  value={form.no}
                  onChange={(e) => setForm({ ...form, no: e.target.value })}
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
                  className="text-center h-7 text-sm"
                  placeholder="Öğrenci No"
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingField(null)}>
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div
                className="group flex items-center justify-center gap-1.5 cursor-pointer hover:bg-accent/50 py-0.5 px-2 rounded-md transition-colors text-muted-foreground"
                onClick={() => setEditingField('no')}
              >
                <span className="text-sm font-medium">No: {form.no || 'Belirtilmemiş'}</span>
                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}

            {course && (
              <p className="text-xs text-muted-foreground mt-1">{course.sinifAdi}</p>
            )}
          </div>
        </div>

        {/* Kamera önizleme */}
        {cameraOpen && (
          <Card>
            <CardContent className="p-3 space-y-3">
              <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg bg-black aspect-[4/3] object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={closeCamera}>İptal</Button>
                <Button className="flex-1" onClick={takePhoto} disabled={photoUploading || notesPhotoUploading}>
                  {(photoUploading || notesPhotoUploading) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                  Çek
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form - Temel Bilgiler */}
        <Card className="border-blue-400/80 border-2 bg-blue-50/10 shadow-md">
          <CardContent className="p-4 space-y-3">
            <style>{`
              @keyframes pc-wiggle {
                0%, 100% { transform: scale(1.12) rotate(0deg); }
                20% { transform: scale(1.12) rotate(-3deg); }
                40% { transform: scale(1.12) rotate(3deg); }
                60% { transform: scale(1.12) rotate(-2deg); }
                80% { transform: scale(1.12) rotate(2deg); }
              }
            `}</style>
            <div className="grid grid-cols-[1fr_2fr] gap-3 items-start">
              <div className="space-y-1.5">
                <Label>PC No</Label>
                <div
                  ref={pcWrapRef}
                  onPointerDown={handlePcPointerDown}
                  onPointerMove={handlePcPointerMove}
                  onPointerUp={handlePcPointerUp}
                  onPointerCancel={handlePcPointerUp}
                  style={pcDragReady && !pcDragging ? { animation: 'pc-wiggle 0.4s ease-in-out infinite' } : undefined}
                  className={`touch-none transition-shadow rounded-md ${pcDragReady ? 'shadow-lg ring-2 ring-primary' : ''
                    }`}
                >
                  <Input
                    ref={pcInputRef}
                    value={form.pcNo}
                    onChange={(e) => setForm({ ...form, pcNo: e.target.value })}
                    className={`px-1.5 ${pcDragReady ? 'pointer-events-none' : ''}`}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Eski PC Noları</Label>
                <div
                  ref={dropZoneRef}
                  className={`min-h-[36px] rounded-md border-2 border-dashed px-2 py-1.5 transition-all flex flex-wrap gap-1 items-center ${isDragOver
                    ? 'border-primary bg-primary/10 scale-[1.02]'
                    : pcDragReady
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-secondary/30'
                    }`}
                >
                  {form.eskiPcNolari.length === 0 && !pcDragReady && (
                    <span className="text-xs text-muted-foreground">PC No → buraya sürükle</span>
                  )}
                  {form.eskiPcNolari.length === 0 && pcDragReady && !isDragOver && (
                    <span className="text-xs text-primary animate-pulse">Buraya bırak!</span>
                  )}
                  {form.eskiPcNolari.map((pc, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-background border border-border px-2 py-0.5 rounded-full text-xs">
                      {pc}
                      <button onClick={() => removeOldPc(i)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form - Davranış Değerlendirmesi */}
        <Card className="border-amber-400/80 border-2 bg-amber-50/10 shadow-md">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Davranış Değerlendirmesi</Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 border-amber-300 text-amber-700 bg-amber-100 hover:bg-amber-200"
                onClick={() => {
                  if (isBehaviorFormOpen) resetBehaviorForm()
                  else setIsBehaviorFormOpen(true)
                }}
              >
                {isBehaviorFormOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                {isBehaviorFormOpen ? 'İptal' : 'Ekle'}
              </Button>
            </div>

            {/* List */}
            {student.behaviorLogs && student.behaviorLogs.length > 0 && (
              <div className="space-y-2 pr-1">
                {[...student.behaviorLogs].reverse().map((log) => (
                  <div key={log.id} className="flex items-start justify-between gap-2 p-2 rounded-md bg-background border border-border/50 text-sm shadow-sm">
                    <div className="flex items-start gap-2 flex-1">
                      {log.type === 'yellow' ? (
                        <Star className="w-4 h-4 mt-0.5 shrink-0 fill-yellow-400 text-yellow-500" />
                      ) : (
                        <StarOff className="w-4 h-4 mt-0.5 shrink-0 text-purple-500" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground">{format(new Date(log.date), 'dd MMM HH:mm', { locale: tr })}</p>
                        {log.note && <p className="font-medium mt-0.5 break-words text-xs">{log.note}</p>}

                        {/* Show multiple photos if they exist, or single photoUrl fallback */}
                        {(log.photoUrls?.length || log.photoUrl) ? (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(log.photoUrls || (log.photoUrl ? [log.photoUrl] : [])).map((url, idx) => {
                              const uniqueId = `${log.id}-${idx}`
                              const isZoomed = zoomedListPhotoId === uniqueId
                              return (
                                <div
                                  key={uniqueId}
                                  className={`w-8 h-8 shrink-0 rounded border border-border transition-all duration-300 origin-top-left overflow-hidden ${isZoomed ? 'scale-[4] z-50 shadow-xl relative cursor-zoom-out' : 'cursor-zoom-in'}`}
                                  onClick={() => setZoomedListPhotoId(isZoomed ? null : uniqueId)}
                                >
                                  <OfflineImage src={url} alt="Kanıt" className="w-full h-full object-cover" />
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => handleEditBehaviorClick(log)} className="text-muted-foreground hover:bg-accent/50 p-1 rounded transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setBehaviorToDelete(log)} className="text-destructive hover:bg-destructive/10 p-1 rounded transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isBehaviorFormOpen && (
              <div className="bg-background p-3 rounded-lg border border-border/60 shadow-sm space-y-2 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <div className="relative" ref={behaviorDropdownRef}>
                      <div className="relative">
                        <Input
                          value={behaviorNote}
                          onChange={(e) => setBehaviorNote(e.target.value)}
                          onFocus={() => setIsDropdownOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAutoSaveBehavior()
                              setIsDropdownOpen(false)
                            }
                          }}
                          placeholder="Davranış seçin veya yazın..."
                          className="w-full text-xs h-9 pr-8"
                        />
                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {isDropdownOpen && (
                        <div className="absolute z-[60] w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-auto py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                          {behaviorOptions.filter(opt => opt.value !== 'custom').map((option, idx) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setBehaviorNote(option.label)
                                setIsDropdownOpen(false)
                                handleAutoSaveBehavior(option.label)
                              }}
                              className={`w-full text-left px-3 py-2 text-xs transition-colors hover:brightness-95 ${
                                idx < 4
                                  ? 'bg-green-100/90 text-green-800 hover:bg-green-200/90'
                                  : 'bg-pink-100/90 text-pink-800 hover:bg-pink-200/90'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {behaviorNote.trim() !== '' && !behaviorOptions.some(opt => opt.label === behaviorNote) && (
                      <div className="flex gap-2 mt-2 px-1 animate-in slide-in-from-top-1 duration-200">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100 gap-1.5 h-8 text-xs font-semibold shadow-sm"
                          onClick={() => handleAutoSaveBehavior(undefined, 'yellow')}
                          disabled={behaviorSaving}
                        >
                          <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-500" />
                          İyi
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 gap-1.5 h-8 text-xs font-semibold shadow-sm"
                          onClick={() => handleAutoSaveBehavior(undefined, 'purple')}
                          disabled={behaviorSaving}
                        >
                          <StarOff className="w-3.5 h-3.5 text-purple-500" />
                          Olumsuz
                        </Button>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Yeşil: iyi davranış, Pembe: kötü davranış. Seçim yapıldığında otomatik kaydedilir.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openCamera('behavior')}
                      className="h-7 w-7 inline-flex items-center justify-center rounded border border-input bg-background hover:bg-accent transition-colors"
                      title="Kamera ile kanıt ekle"
                    >
                      <Camera className="h-3.5 w-3.5" />
                    </button>
                    <label className="h-7 w-7 inline-flex items-center justify-center rounded border border-input bg-background hover:bg-accent transition-colors cursor-pointer" title="Dosyadan kanıt ekle">
                      <Upload className="h-3.5 w-3.5" />
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleBehaviorFileUpload} />
                    </label>
                  </div>
                </div>

                {behaviorPhotoUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {behaviorPhotoUrls.map((url, idx) => (
                      <div key={idx} className="relative group w-12 h-12">
                        <div
                          className={`w-12 h-12 border border-border overflow-hidden transition-all duration-300 origin-top-left ${zoomedBehaviorPhotoIndex === idx ? 'scale-[4] z-50 shadow-xl relative rounded-md bg-background cursor-zoom-out' : 'rounded-lg cursor-zoom-in'}`}
                          onClick={() => setZoomedBehaviorPhotoIndex(zoomedBehaviorPhotoIndex === idx ? null : idx)}
                        >
                          <img src={url} alt="Kanıt" className="w-full h-full object-cover" />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeBehaviorPhoto(idx)
                            if (zoomedBehaviorPhotoIndex === idx) setZoomedBehaviorPhotoIndex(null)
                          }}
                          className={`absolute -top-1.5 -right-1.5 w-4 h-4 bg-destructive text-white rounded-full flex items-center justify-center transition-opacity ${zoomedBehaviorPhotoIndex === idx ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Form - BEP ve Özel Durumlar */}
        <Card className="border-purple-400/80 border-2 bg-purple-50/10 shadow-md">
          <CardContent className="p-4 space-y-4">
            {/* BEP Satırı */}
            <div className="space-y-1.5">
              <Label>BEP</Label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.bep ?? false}
                    onChange={(e) => setForm({ ...form, bep: e.target.checked })}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                  <span className="text-sm">BEP</span>
                </label>
                <Input
                  placeholder="BEP notu..."
                  value={form.bepNotu ?? ''}
                  onChange={(e) => setForm({ ...form, bepNotu: e.target.value })}
                  disabled={!form.bep}
                  className="h-8 text-sm flex-1"
                />
                <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={form.bepPlaniYapildi ?? false}
                    onChange={(e) => setForm({ ...form, bepPlaniYapildi: e.target.checked })}
                    disabled={!form.bep}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                  <span className="text-sm whitespace-nowrap">Planı Yapıldı</span>
                </label>
              </div>
            </div>

            {/* Özel Durum Notları */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Özel Durum Notları</Label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => openCamera('notes')}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent transition-colors"
                    title="Kamera ile fotoğraf ekle"
                  >
                    {notesPhotoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  </button>
                  <label className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent transition-colors cursor-pointer" title="Dosyadan fotoğraf ekle">
                    <Upload className="h-3.5 w-3.5" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleNotesFileUpload} />
                  </label>
                </div>
              </div>
              <Textarea
                value={form.ozelDurumNotlari}
                onChange={(e) => setForm({ ...form, ozelDurumNotlari: e.target.value })}
                placeholder="Gözlemler, notlar..."
                rows={3}
              />
              {/* Not fotoğrafları önizleme */}
              {(form.ozelDurumFotolari ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {(form.ozelDurumFotolari ?? []).map((url, i) => {
                    const isZoomed = zoomedNotePhotoIndex === i
                    return (
                      <div key={i} className="relative group">
                        <div
                          className={`w-16 h-16 border border-border overflow-hidden transition-all duration-300 origin-top-left ${isZoomed ? 'scale-[4] z-50 shadow-xl relative rounded-md bg-background cursor-zoom-out' : 'rounded-lg cursor-zoom-in'}`}
                          onClick={() => setZoomedNotePhotoIndex(isZoomed ? null : i)}
                          title={isZoomed ? "Küçült" : "Büyüt"}
                        >
                          <OfflineImage
                            src={url}
                            alt={`Not fotoğrafı ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setNotePhotoToDeleteIdx(i)
                          }}
                          className={`absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center transition-opacity ${isZoomed ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Not Fotoğrafı Silme Onayı */}
            <ConfirmDialog
              open={notePhotoToDeleteIdx !== null}
              onOpenChange={(isOpen) => !isOpen && setNotePhotoToDeleteIdx(null)}
              title="Fotoğrafı Sil"
              description="Bu fotoğrafı silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
              confirmText="Sil"
              variant="destructive"
              onConfirm={() => {
                if (notePhotoToDeleteIdx !== null) {
                  removeNotePhoto(notePhotoToDeleteIdx)
                  setNotePhotoToDeleteIdx(null)
                  setZoomedNotePhotoIndex(null)
                }
              }}
            />

            {/* Davranış Silme Onayı */}
            <ConfirmDialog
              open={behaviorToDelete !== null}
              onOpenChange={(isOpen) => !isOpen && setBehaviorToDelete(null)}
              title="Davranış Kaydını Sil"
              description="Bu davranış kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
              confirmText="Sil"
              variant="destructive"
              onConfirm={handleDeleteBehaviorLog}
            />

          </CardContent>
        </Card>

        {/* Uygulama Puanları Grafiği */}
        <Card className="border-indigo-400/80 border-2 bg-indigo-50/10 shadow-md">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-3">Uygulama Puanları Grafiği</h3>
            {chartLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Henüz puan girilmedi.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="puan"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ fill: '#6366f1', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Öğrenci Sil Butonu */}
        <div className="pt-4 pb-8">
          <Button
            variant="ghost"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Öğrenciyi Sil
          </Button>
        </div>
      </div>

      {/* Silme Onay Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>Öğrenciyi Sil</DialogTitle>
            <DialogDescription>
              <strong>{student.adSoyad}</strong> isimli öğrenciyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve öğrenciye ait tüm puanlar silinecektir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              İptal
            </Button>
            <Button
              variant="destructive"
              className="flex-1 sm:flex-none"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Siliniyor...
                </>
              ) : (
                'Evet, Sil'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pcDragging && form?.pcNo && (
        <div
          className="fixed z-50 pointer-events-none bg-primary text-white px-3 py-1 rounded-full text-sm font-medium shadow-lg"
          style={{ left: ghostPos.x, top: ghostPos.y, transform: 'translate(-50%, -120%)' }}
        >
          {form.pcNo}
        </div>
      )}
    </Layout>
  )
}
