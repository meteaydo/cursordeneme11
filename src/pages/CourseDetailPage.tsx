import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { collection, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { DialogDescription } from '@/components/ui/dialog'
import {
  Plus, Camera, Download, Loader2, UserPlus, FileSpreadsheet, Upload, AlertTriangle, Check, Trash2, Star, StarOff, FileText, X, Eye, Search, ArrowUpDown, Menu, MoreVertical, ImageIcon, CalendarDays
} from 'lucide-react'
import Fuse from 'fuse.js'
import { Layout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SmartNumpad } from '@/components/ui/smart-numpad'
import { useStudents } from '@/hooks/useStudents'
import { useApplications } from '@/hooks/useApplications'
import { useCourses } from '@/hooks/useCourses'
import { queueImageUpload } from '@/lib/imageQueue'
import { OfflineImage } from '@/components/ui/OfflineImage'
import { toast } from '@/hooks/use-toast'
import type { AnnualPlan, Application, Score, Student, StudentFormData } from '@/types'
import ExcelJS from 'exceljs'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { formatTitleCase, formatClassName, getScoreKameraFotolar, getScoreKanitSayilari, MAX_UYGULAMA_FOTO, type KanitKaynagi } from '@/lib/utils'
import { parseStudentExcel, type ParsedStudent } from '@/lib/excelStudentParser'
import { parseClassTemplate, fetchClassList } from '@/services/classTemplateService'
import { AnnualPlanBanner } from '@/components/AnnualPlanBanner'
import { parseAnnualPlanDocx } from '@/lib/annualPlanParser'

const EMPTY_STUDENT: StudentFormData = {
  no: '', adSoyad: '', pcNo: '', eskiPcNolari: [], ozelDurumNotlari: '', foto: '',
  behaviorStars: { yellow: 0, purple: 0 },
  behaviorLogs: [],
}

type StudentListSortKey = 'no' | 'pcNo' | 'adSoyad'

function compareStudentsBySortKey(a: Student, b: Student, key: StudentListSortKey): number {
  if (key === 'no') {
    const na = Number(a.no)
    const nb = Number(b.no)
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
    return a.no.localeCompare(b.no, 'tr', { numeric: true })
  }
  if (key === 'pcNo') {
    return (a.pcNo || '').localeCompare(b.pcNo || '', 'tr', { numeric: true })
  }
  return a.adSoyad.localeCompare(b.adSoyad, 'tr')
}

function studentHasPuan(score?: Score): boolean {
  if (score?.devamsiz) return true
  return scoreHasEnteredPuan(score)
}

function scoreHasEnteredPuan(score?: Score): boolean {
  return score?.puan !== null && score?.puan !== undefined && String(score.puan) !== ''
}

type ReportScoreCell = number | 'D' | ''

interface ReportTableRow {
  no: string
  adSoyad: string
  pcNo: string
  scores: ReportScoreCell[]
  ortalama: number | ''
}

interface ReportTableData {
  apps: Application[]
  rows: ReportTableRow[]
}

function reportScoreClass(value: ReportScoreCell) {
  if (value === 'D') return 'text-red-500 font-bold'
  if (typeof value === 'number') {
    if (value < 50) return 'text-red-500 font-bold'
    if (value >= 85) return 'text-emerald-500 font-bold'
  }
  return ''
}

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const id = courseId!

  const state = location.state as { courseName?: string; className?: string; fromTemplate?: boolean } | null
  const pageTitle = state?.courseName ? `${state.courseName} - ${state.className}` : "Ders Uygulamaları"

  const { students, loading: studentsLoading, addStudent, addStudentsBulk } = useStudents(id)
  const { applications, loading: appsLoading, addApplication, updateApplication, deleteApplication, getScores, setScore } = useApplications(id)
  const { courses, updateCourse } = useCourses()
  const course = useMemo(() => courses.find((c) => c.id === id), [courses, id])

  // Selected application for scoring
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [scores, setScores] = useState<Record<string, Score>>({})
  const [scoresLoading, setScoresLoading] = useState(false)

  // Dialogs
  const [addAppOpen, setAddAppOpen] = useState(false)
  const [editAppOpen, setEditAppOpen] = useState(false)
  const [deleteAppConfirmOpen, setDeleteAppConfirmOpen] = useState(false)
  const [appToEdit, setAppToEdit] = useState<Application | null>(null)
  const [addStudentOpen, setAddStudentOpen] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportViewOpen, setReportViewOpen] = useState(false)
  const [reportViewLoading, setReportViewLoading] = useState(false)
  const [reportViewData, setReportViewData] = useState<ReportTableData | null>(null)
  const [reportExporting, setReportExporting] = useState(false)

  // App form
  const [appForm, setAppForm] = useState({ ad: '', tarih: format(new Date(), 'yyyy-MM-dd'), foto: '' as string | undefined })
  const [appSaving, setAppSaving] = useState(false)
  const [newlyAddedAppId, setNewlyAddedAppId] = useState<string | null>(null)

  // Student form
  const [studentForm, setStudentForm] = useState<StudentFormData>(EMPTY_STUDENT)
  const [studentSaving, setStudentSaving] = useState(false)
  const [newStudentPhoto, setNewStudentPhoto] = useState<Blob | File | null>(null)
  const [newStudentPhotoPreview, setNewStudentPhotoPreview] = useState('')

  // Report form
  const [reportRange, setReportRange] = useState({
    from: format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  })
  const [reportTitle, setReportTitle] = useState('')

  // Sayfa başlığı değiştikçe rapor başlığını güncelle
  useEffect(() => {
    const dersAdi = state?.courseName || "Ders";
    setReportTitle(`Mehmet Akif Ersoy Ticaret MTAL - ${dersAdi} Performans Analizi`);
  }, [state?.courseName]);

  // Excel preview
  const [parsedStudents, setParsedStudents] = useState<ParsedStudent[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [excelParsing, setExcelParsing] = useState(false)
  const [excelError, setExcelError] = useState<string | null>(null)
  const [excelSaving, setExcelSaving] = useState(false)
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({})

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraStudentId, setCameraStudentId] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [numpadOpenFor, setNumpadOpenFor] = useState<string | null>(null)
  const [studentSortKey, setStudentSortKey] = useState<StudentListSortKey>('no')
  const [studentSearch, setStudentSearch] = useState('')
  const [onlyBos, setOnlyBos] = useState(false)
  const [courseMenuOpen, setCourseMenuOpen] = useState(false)
  const [devamsizListOpen, setDevamsizListOpen] = useState(false)
  const [annualPlanOpen, setAnnualPlanOpen] = useState(false)
  const [annualPlanPreview, setAnnualPlanPreview] = useState<AnnualPlan | null>(null)
  const [annualPlanParsing, setAnnualPlanParsing] = useState(false)
  const [annualPlanSaving, setAnnualPlanSaving] = useState(false)
  const annualPlanFileRef = useRef<HTMLInputElement>(null)

  const studentFuse = useMemo(
    () =>
      new Fuse(students, {
        keys: [
          { name: 'adSoyad', weight: 0.6 },
          { name: 'no', weight: 0.25 },
          { name: 'pcNo', weight: 0.15 },
        ],
        threshold: 0.4,
        includeScore: true,
      }),
    [students],
  )

  const displayedStudents = useMemo(() => {
    const q = studentSearch.trim()
    let base = q ? studentFuse.search(q).map((r) => r.item) : students
    if (onlyBos && selectedApp) {
      base = base.filter((s) => !studentHasPuan(scores[s.id]))
    }
    return [...base].sort((a, b) => compareStudentsBySortKey(a, b, studentSortKey))
  }, [students, studentSearch, studentSortKey, studentFuse, onlyBos, selectedApp, scores])

  const scoreProgress = useMemo(() => {
    const total = students.length
    if (!selectedApp || total === 0) return null
    const scored = students.filter((s) => studentHasPuan(scores[s.id])).length
    return { empty: total - scored }
  }, [students, scores, selectedApp])

  const displayedDevamsizCount = useMemo(() => {
    if (!selectedApp) return null
    return displayedStudents.filter((s) => scores[s.id]?.devamsiz).length
  }, [displayedStudents, scores, selectedApp])

  const devamsizStudentsList = useMemo(() => {
    if (!selectedApp) return []
    return displayedStudents.filter((s) => scores[s.id]?.devamsiz)
  }, [displayedStudents, scores, selectedApp])

  // Scroll Anchoring refs
  const studentsContainerRef = useRef<HTMLDivElement>(null)
  const stickyHeaderRef = useRef<HTMLDivElement>(null)
  const scrollAnchorRef = useRef<{ id: string | null; prevTop: number; smoothAlign: boolean }>({
    id: null,
    prevTop: 0,
    smoothAlign: false
  })

  // Template loader denemesi state'i
  const templateAttempted = useRef(false)

  // Hazır liste yükleme state'leri
  const [grades, setGrades] = useState<string[]>([])
  const [sections, setSections] = useState<string[]>([])
  const [selGrade, setSelGrade] = useState('')
  const [selSection, setSelSection] = useState('')

  useEffect(() => {
    fetchClassList().then(list => {
      const g = Array.from(new Set(list.map(c => c.match(/^\d+/)?.[0]).filter(Boolean))) as string[]
      const s = Array.from(new Set(list.map(c => c.match(/[A-Z]+$/)?.[0]).filter(Boolean))) as string[]
      setGrades(g.sort((a, b) => Number(a) - Number(b)))
      setSections(s.sort())
    })
  }, [])

  useEffect(() => {
    return () => {
      if (newStudentPhotoPreview.startsWith('blob:')) URL.revokeObjectURL(newStudentPhotoPreview)
    }
  }, [newStudentPhotoPreview])

  // DOM güncellendikten hemen sonra (ekrana çizilmeden önce) kaydırma zıplamasını düzelt
  useLayoutEffect(() => {
    if (scrollAnchorRef.current.id) {
      const { id, prevTop, smoothAlign } = scrollAnchorRef.current
      const el = document.querySelector(`[data-student-id="${id}"]`) as HTMLElement
      const stickyHeader = stickyHeaderRef.current

      if (el && stickyHeader) {
        const xPoint = stickyHeader.getBoundingClientRect().bottom
        const newTop = el.getBoundingClientRect().top

        // Elemanın DOM genişlemesiyle aşağı ne kadar itildiğini bul
        const diff = newTop - prevTop

        // 1. Anında (instant) tersine kaydırarak atlamayı engelle (üsttekiler yukarı genişlesin)
        if (diff !== 0) {
          window.scrollBy({ top: diff, behavior: 'instant' })
        }

        // 2. Ardından o elemanı X noktasına smooth şekilde hizala
        if (smoothAlign) {
          // Güncel top değerini tekrar alıyoruz (çünkü az önce scrollBy yaptık)
          const currentTop = el.getBoundingClientRect().top
          // Elemanın top değeri X noktasından ne kadar uzakta? (Biraz da margin payı bırakalım: - 16px)
          const yOffset = currentTop - xPoint - 16

          if (Math.abs(yOffset) > 2) {
            requestAnimationFrame(() => {
              window.scrollBy({ top: yOffset, behavior: 'smooth' })
            })
          }
        }
      }

      // İşlem bitince sıfırla
      scrollAnchorRef.current = { id: null, prevTop: 0, smoothAlign: false }
    }
  }, [selectedApp]) // Uygulama seçimi değiştiğinde çalışır

  useEffect(() => {
    if (!selectedApp) setOnlyBos(false)
  }, [selectedApp])

  // Load scores when app selected
  useEffect(() => {
    if (!selectedApp) return
    setScoresLoading(true)
    getScores(selectedApp.id).then((s) => {
      const map: Record<string, Score> = {}
      s.forEach((sc) => (map[sc.studentId] = sc))
      setScores(map)
      setScoresLoading(false)
    })
  }, [selectedApp])

  // Select newly added app automatically
  useEffect(() => {
    if (newlyAddedAppId && applications.length > 0) {
      const app = applications.find(a => a.id === newlyAddedAppId)
      if (app) {
        setSelectedApp(app)
        setNewlyAddedAppId(null)
      }
    }
  }, [applications, newlyAddedAppId])

  // Sayfa ilk açıldığında en son uygulamayı (listenin ilk elemanı) otomatik seç
  useEffect(() => {
    if (applications.length > 0 && !selectedApp && !newlyAddedAppId) {
      setSelectedApp(applications[0])
    }
  }, [applications])

  // Template kontrolü
  useEffect(() => {
    if (state?.fromTemplate && state?.className && !studentsLoading && students.length === 0 && !templateAttempted.current) {
      templateAttempted.current = true;
      loadTemplate(state.className);
    }
  }, [state?.fromTemplate, state?.className, studentsLoading, students.length]);

  const loadTemplate = async (className: string) => {
    setExcelParsing(true)
    setExcelError(null)
    try {
      const result = await parseClassTemplate(className)
      
      const existingNos = new Set(students.map(s => String(s.no).trim().toLowerCase()))
      const newStudents = result.filter(s => !existingNos.has(String(s.no).trim().toLowerCase()))
      const duplicatesCount = result.length - newStudents.length

      if (newStudents.length === 0) {
        throw new Error('Listedeki tüm öğrenciler bu sınıfta zaten kayıtlı.')
      }

      if (duplicatesCount > 0) {
        toast({
          title: 'Bilgi',
          description: `${duplicatesCount} öğrenci zaten kayıtlı olduğu için atlandı.`,
        })
      }

      setParsedStudents(newStudents)
      setAddStudentOpen(false)
      const urls: Record<number, string> = {}
      newStudents.forEach((s, i) => {
        if (s.foto) urls[i] = URL.createObjectURL(s.foto)
      })
      setPreviewUrls(urls)
      setPreviewOpen(true)
    } catch (err) {
      toast({ title: 'Liste İndirilemedi', description: err instanceof Error ? err.message : 'Otomatik sınıf listesi indirilemedi. Gerekirse manuel olarak Excel\'den yükleyebilirsiniz.', variant: 'destructive' })
    } finally {
      setExcelParsing(false)
    }
  }

  const handleAppSelect = (app: Application, e?: React.MouseEvent<HTMLButtonElement>) => {
    if (e && e.currentTarget) {
      e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
    }

    const stickyHeader = stickyHeaderRef.current
    const container = studentsContainerRef.current

    if (stickyHeader && container) {
      // Sticky alanın alt çizgisini X noktası kabul et
      const xPoint = stickyHeader.getBoundingClientRect().bottom
      const rows = Array.from(container.children) as HTMLElement[]

      // X noktasından aşağıda kalan en üstteki satırı (visibleRow) bul (-10px tolerans payı ile)
      const visibleRow = rows.find(row => {
        const rect = row.getBoundingClientRect()
        return rect.top >= xPoint - 10
      })

      if (visibleRow) {
        const targetId = visibleRow.getAttribute('data-student-id')
        if (targetId) {
          // Genişleme/Daralma öncesi konumu kaydet
          scrollAnchorRef.current = {
            id: targetId,
            prevTop: visibleRow.getBoundingClientRect().top,
            smoothAlign: true // State değişip DOM render edildikten sonra X noktasına hizalanmasını iste
          }
        }
      }
    }

    setSelectedApp(selectedApp?.id === app.id ? null : app)
  }

  const handleAppContextMenu = (e: React.MouseEvent, app: Application) => {
    e.preventDefault()
    setAppToEdit(app)
    setAppForm({ ad: app.ad, tarih: app.tarih, foto: app.foto })
    setEditAppOpen(true)
  }

  const handleEditApp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appToEdit) return
    setAppSaving(true)
    await updateApplication(appToEdit.id, { ad: appForm.ad, tarih: appForm.tarih, foto: appForm.foto })
    setEditAppOpen(false)
    setAppToEdit(null)
    setAppForm({ ad: '', tarih: format(new Date(), 'yyyy-MM-dd'), foto: undefined })
    setAppSaving(false)
  }

  const handleDeleteApp = async () => {
    if (!appToEdit) return
    setAppSaving(true)
    await deleteApplication(appToEdit.id)
    if (selectedApp?.id === appToEdit.id) setSelectedApp(null)
    setDeleteAppConfirmOpen(false)
    setAppToEdit(null)
    setAppSaving(false)
  }

  const nextAppName = `${applications.length + 1}.Uygulama`

  const handleAddApp = async (e: React.FormEvent) => {
    e.preventDefault()
    setAppSaving(true)
    const ad = appForm.ad.trim() || nextAppName
    const newId = await addApplication(ad, appForm.tarih)
    if (newId) setNewlyAddedAppId(newId)
    setAddAppOpen(false)
    setAppForm({ ad: '', tarih: format(new Date(), 'yyyy-MM-dd'), foto: undefined })
    setAppSaving(false)
  }

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const targetNo = String(studentForm.no).trim().toLowerCase()
    const exists = students.some(s => String(s.no).trim().toLowerCase() === targetNo)
    if (exists) {
      toast({ title: 'Hata', description: 'Bu numaraya sahip bir öğrenci zaten mevcut.', variant: 'destructive' })
      return
    }

    setStudentSaving(true)
    const studentId = await addStudent({ ...studentForm, foto: '' })
    if (studentId && newStudentPhoto) {
      try {
        await queueImageUpload(newStudentPhoto, `students/${studentId}/foto.jpg`, {
          collection: `courses/${id}/students`,
          docId: studentId,
          field: 'foto',
        })
      } catch {
        toast({ title: 'Uyarı', description: 'Öğrenci eklendi ancak fotoğraf yüklenemedi.', variant: 'destructive' })
      }
    }
    clearNewStudentPhoto()
    setStudentForm(EMPTY_STUDENT)
    setAddStudentOpen(false)
    setStudentSaving(false)
  }

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setExcelParsing(true)
    setExcelError(null)

    try {
      const result = await parseStudentExcel(file)

      // Sınıfta zaten olan öğrencileri filtrele (numaraya göre)
      const existingNos = new Set(students.map(s => String(s.no).trim().toLowerCase()))
      const newStudents = result.filter(s => !existingNos.has(String(s.no).trim().toLowerCase()))
      const duplicatesCount = result.length - newStudents.length

      if (newStudents.length === 0) {
        throw new Error('Dosyadaki tüm öğrenciler bu sınıfta zaten kayıtlı.')
      }

      if (duplicatesCount > 0) {
        toast({
          title: 'Bilgi',
          description: `${duplicatesCount} öğrenci zaten kayıtlı olduğu için atlandı.`,
        })
      }

      setParsedStudents(newStudents)

      const urls: Record<number, string> = {}
      newStudents.forEach((s, i) => {
        if (s.foto) urls[i] = URL.createObjectURL(s.foto)
      })
      setPreviewUrls(urls)

      setAddStudentOpen(false)
      setPreviewOpen(true)
    } catch (err) {
      setExcelError(err instanceof Error ? err.message : 'Excel dosyası okunamadı.')
    } finally {
      setExcelParsing(false)
      e.target.value = ''
    }
  }

  const handlePreviewConfirm = async () => {
    setExcelSaving(true)
    try {
      const mapped: (StudentFormData & { id: string })[] = []
      
      // Öğrencilerin foto yükleme işlemlerini paralel olarak başlat
      const tasks = parsedStudents.map(async (s, i) => {
        const docRef = doc(collection(db, 'courses', id, 'students'))
        const docId = docRef.id

        const pcIndex = students.length + i + 1
        const pcNoStr = `PC${String(pcIndex).padStart(2, '0')}`

        let finalFotoUrl = ''

        if (s.foto) {
          const key = `students/${docId}/foto.jpg`
          try {
            finalFotoUrl = await queueImageUpload(s.foto, key, {
              collection: `courses/${id}/students`,
              docId,
              field: 'foto'
            })
          } catch {
            // sessizce geç
          }
        }

        mapped.push({
          id: docId,
          no: s.no,
          adSoyad: formatTitleCase(s.adSoyad),
          pcNo: pcNoStr,
          eskiPcNolari: [],
          ozelDurumNotlari: '',
          foto: finalFotoUrl,
          behaviorStars: { yellow: 0, purple: 0 },
          behaviorLogs: [],
        })
      })

      // Tüm öğrencilerin fotoğraflarının IndexedDB'ye eklenmesini bekle
      await Promise.all(tasks)

      // Tüm öğrencileri tek seferde (1 batch içinde) kaydet
      await addStudentsBulk(mapped)

      Object.values(previewUrls).forEach(URL.revokeObjectURL)
      setPreviewUrls({})
      setParsedStudents([])
      setPreviewOpen(false)

      // Firebase'in yeni oluşturulan koleksiyonlarda snapshot yakalama problemini (gecikmeyi) aşmak için 
      // sayfayı otomatik ve veriler yüklenmiş halde temiz bir şekilde yeniden yüklüyoruz.
      window.location.replace(window.location.pathname)
    } catch {
      toast({ title: 'Hata', description: 'Öğrenciler kaydedilirken hata oluştu.', variant: 'destructive' })
    } finally {
      setExcelSaving(false)
    }
  }

  const handlePreviewCancel = () => {
    Object.values(previewUrls).forEach(URL.revokeObjectURL)
    setPreviewUrls({})
    setParsedStudents([])
    setPreviewOpen(false)
    setExcelError(null)
  }

  const handleScoreChange = async (studentId: string, puan: string) => {
    if (!selectedApp) return
    const val = puan === '' ? null : Number(puan)
    await setScore(selectedApp.id, studentId, { puan: val })
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], id: studentId, applicationId: selectedApp.id, studentId, puan: val },
    }))
  }

  const handleDevamsizToggle = async (studentId: string) => {
    if (!selectedApp) return
    const current = scores[studentId]?.devamsiz ?? false
    const next = !current
    await setScore(selectedApp.id, studentId, { devamsiz: next })
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], id: studentId, applicationId: selectedApp.id, studentId, devamsiz: next },
    }))
  }

  const handleKisaNotChange = async (studentId: string, kisaNot: string) => {
    if (!selectedApp) return
    await setScore(selectedApp.id, studentId, { kisaNot })
    setScores((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], id: studentId, applicationId: selectedApp.id, studentId, kisaNot },
    }))
  }

  const handlePhotoDelete = async (studentId: string, photoUrl: string) => {
    if (!selectedApp) return

    const urls = getScoreKameraFotolar(scores[studentId])
    const sources = scores[studentId]?.kanitKaynaklari ?? urls.map(() => 'kamera' as KanitKaynagi)
    const remainingPairs = urls
      .map((url, i) => ({ url, kaynak: sources[i] ?? 'kamera' }))
      .filter(({ url }) => url !== photoUrl)
    const remaining = remainingPairs.map(({ url }) => url)
    const remainingKaynak = remainingPairs.map(({ kaynak }) => kaynak)

    await setScore(selectedApp.id, studentId, {
      kameraFotolar: remaining,
      kameraFoto: null,
      kanitKaynaklari: remainingKaynak.length ? remainingKaynak : undefined,
    })
    setScores((prev) => {
      const currentStudentScore = prev[studentId]
      if (!currentStudentScore) return prev

      if (remaining.length === 0) {
        const { kameraFoto: _k, kameraFotolar: _f, kanitKaynaklari: _kk, ...rest } = currentStudentScore
        return { ...prev, [studentId]: rest as Score }
      }

      const { kameraFoto: _k, ...rest } = currentStudentScore
      return {
        ...prev,
        [studentId]: { ...rest, kameraFotolar: remaining, kanitKaynaklari: remainingKaynak } as Score,
      }
    })
  }

  const clearNewStudentPhoto = () => {
    if (newStudentPhotoPreview.startsWith('blob:')) URL.revokeObjectURL(newStudentPhotoPreview)
    setNewStudentPhoto(null)
    setNewStudentPhotoPreview('')
  }

  const applyNewStudentPhoto = (fileOrBlob: Blob | File) => {
    if (newStudentPhotoPreview.startsWith('blob:')) URL.revokeObjectURL(newStudentPhotoPreview)
    setNewStudentPhoto(fileOrBlob)
    setNewStudentPhotoPreview(URL.createObjectURL(fileOrBlob))
  }

  const handleNewStudentFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    applyNewStudentPhoto(file)
    e.target.value = ''
  }

  // Camera functions
  const openCamera = async (studentId: string) => {
    setCameraStudentId(studentId)
    setCameraOpen(true)
    try {
      const facingMode = studentId === 'NEW_STUDENT' ? 'user' : 'environment'
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
    setCameraStudentId(null)
  }

  const takePhoto = async () => {
    if (!canvasRef.current || !videoRef.current || !cameraStudentId) return
    if (cameraStudentId !== 'APP_COVER_EDIT' && cameraStudentId !== 'NEW_STUDENT' && !selectedApp) return

    const ctx = canvasRef.current.getContext('2d')!
    canvasRef.current.width = videoRef.current.videoWidth
    canvasRef.current.height = videoRef.current.videoHeight
    ctx.drawImage(videoRef.current, 0, 0)
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return
      if (cameraStudentId === 'NEW_STUDENT') {
        applyNewStudentPhoto(blob)
        closeCamera()
      } else if (cameraStudentId === 'APP_COVER_EDIT') {
        uploadAppPhoto(blob)
      } else if (selectedApp) {
        uploadPhoto(blob, cameraStudentId)
      }
    }, 'image/jpeg', 0.8)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, studentId: string) => {
    const file = e.target.files?.[0]
    if (!file || !selectedApp) return

    setCameraStudentId(studentId)
    uploadPhoto(file, studentId, 'dosya')
  }

  const uploadPhoto = async (fileOrBlob: Blob | File, sId: string, kaynak: KanitKaynagi = 'kamera') => {
    if (!selectedApp || !sId) return

    const existing = getScoreKameraFotolar(scores[sId])
    if (existing.length >= MAX_UYGULAMA_FOTO) {
      toast({
        title: 'Limit',
        description: `En fazla ${MAX_UYGULAMA_FOTO} uygulama fotoğrafı eklenebilir.`,
        variant: 'destructive',
      })
      return
    }

    setPhotoUploading(true)

    const tempUrl = URL.createObjectURL(fileOrBlob)
    const optimistic = [...existing, tempUrl]
    const prevKaynak = scores[sId]?.kanitKaynaklari ?? existing.map(() => 'kamera' as KanitKaynagi)
    const optimisticKaynak = [...prevKaynak.slice(0, existing.length), kaynak]
    setScores((prev) => ({
      ...prev,
      [sId]: {
        ...prev[sId],
        id: sId,
        applicationId: selectedApp.id,
        studentId: sId,
        kameraFotolar: optimistic,
        kanitKaynaklari: optimisticKaynak,
      },
    }))

    try {
      const photoId = crypto.randomUUID()
      const key = `applications/${selectedApp.id}/${sId}/${photoId}.jpg`
      const localUrl = await queueImageUpload(fileOrBlob, key, {
        collection: `courses/${id}/applications/${selectedApp.id}/scores`,
        docId: sId,
        field: 'kameraFotolar',
        isArray: true,
      })

      const withLocal = [...existing, localUrl]
      const withKaynak = [...prevKaynak.slice(0, existing.length), kaynak]
      await setScore(selectedApp.id, sId, {
        kameraFotolar: withLocal,
        kameraFoto: null,
        kanitKaynaklari: withKaynak,
      })

      setScores((prev) => ({
        ...prev,
        [sId]: {
          ...prev[sId],
          id: sId,
          applicationId: selectedApp.id,
          studentId: sId,
          kameraFotolar: withLocal,
          kanitKaynaklari: withKaynak,
        },
      }))
      closeCamera()
    } catch {
      setScores((prev) => ({
        ...prev,
        [sId]: {
          ...prev[sId],
          kameraFotolar: existing.length ? existing : undefined,
          kanitKaynaklari: existing.length ? prevKaynak.slice(0, existing.length) : undefined,
        },
      }))
      toast({ title: 'Hata', description: 'Fotoğraf yüklenemedi.', variant: 'destructive' })
    } finally {
      setPhotoUploading(false)
      setCameraStudentId(null)
    }
  }

  const handleAppFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !appToEdit) return

    setCameraStudentId('APP_COVER_EDIT')
    uploadAppPhoto(file)
  }

  const uploadAppPhoto = async (fileOrBlob: Blob | File) => {
    if (!appToEdit) return
    setPhotoUploading(true)

    const tempUrl = URL.createObjectURL(fileOrBlob)
    setAppForm(prev => ({ ...prev, foto: tempUrl }))

    try {
      const key = `applications/${appToEdit.id}/cover.jpg`
      const localUrl = await queueImageUpload(fileOrBlob, key, {
        collection: `courses/${id}/applications`,
        docId: appToEdit.id,
        field: 'foto'
      })

      setAppForm(prev => ({ ...prev, foto: localUrl }))
      closeCamera()
    } catch {
      toast({ title: 'Hata', description: 'Uygulama fotoğrafı yüklenemedi.', variant: 'destructive' })
    } finally {
      setPhotoUploading(false)
      setCameraStudentId(null)
    }
  }

  // Report export
  const buildReportTable = async (): Promise<ReportTableData> => {
    const apps = applications.filter(
      (a) => a.tarih >= reportRange.from && a.tarih <= reportRange.to,
    )

    const allScoresData: Record<string, Record<string, Score>> = {}
    await Promise.all(apps.map(async (app) => {
      const appScores = await getScores(app.id)
      const studentMap: Record<string, Score> = {}
      appScores.forEach((sc) => {
        studentMap[sc.studentId] = sc
      })
      allScoresData[app.id] = studentMap
    }))

    const rows = students.map((s) => {
      let sum = 0
      let count = 0
      const scores = apps.map((app) => {
        const scoreObj = allScoresData[app.id]?.[s.id]
        if (scoreObj?.devamsiz) return 'D' as const
        const puan = scoreObj?.puan
        if (puan !== undefined && puan !== null) {
          const numPuan = Number(puan)
          sum += numPuan
          count++
          return numPuan
        }
        return '' as const
      })
      return {
        no: s.no,
        adSoyad: s.adSoyad,
        pcNo: s.pcNo,
        scores,
        ortalama: count > 0 ? Math.round(sum / count) : '' as const,
      }
    })

    return { apps, rows }
  }

  const exportReportExcel = async (table: ReportTableData) => {
    const { apps, rows } = table
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Rapor')

    ws.getColumn(1).width = 10
    ws.getColumn(2).width = 30
    ws.getColumn(3).width = 10
    for (let i = 0; i < apps.length; i++) {
      ws.getColumn(4 + i).width = 15
    }
    ws.getColumn(4 + apps.length).width = 15

    const totalCols = 4 + apps.length
    ws.mergeCells(1, 1, 1, totalCols)
    const titleCell = ws.getCell(1, 1)
    titleCell.value = reportTitle
    titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
    ws.getRow(1).height = 30

    const headers = ['No', 'Ad Soyad', 'PC No', ...apps.map((a) => `${a.ad}\n(${format(new Date(a.tarih), 'dd.MM.yyyy')})`), 'ORT']
    ws.addRow(headers)

    const headerRow = ws.getRow(2)
    headerRow.height = 35
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } }
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      }
    })

    rows.forEach((s) => {
      const addedRow = ws.addRow([s.no, s.adSoyad, s.pcNo, ...s.scores, s.ortalama])
      addedRow.height = 20
      addedRow.eachCell((cell, colNumber) => {
        cell.alignment = colNumber > 3 ? { vertical: 'middle', horizontal: 'center' } : { vertical: 'middle', horizontal: 'left' }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        }

        if (colNumber > 3 && typeof cell.value === 'number') {
          if (cell.value < 50) {
            cell.font = { color: { argb: 'FFEF4444' }, bold: true }
          } else if (cell.value >= 85) {
            cell.font = { color: { argb: 'FF10B981' }, bold: true }
          }
        }

        if (cell.value === 'D') {
          cell.font = { color: { argb: 'FFEF4444' }, bold: true }
        }

        if (colNumber === 4 + apps.length) {
          cell.font = { ...cell.font, bold: true }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
        }
      })
    })

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    const dersAdi = state?.courseName || "Ders"
    const fileName = `${dersAdi}_${format(new Date(reportRange.from), 'dd.MM.yyyy')}_${format(new Date(reportRange.to), 'dd.MM.yyyy')}_perf_analizi.xlsx`
    anchor.download = fileName
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  const handleReport = async () => {
    setReportExporting(true)
    try {
      const table = await buildReportTable()
      await exportReportExcel(table)
      setReportOpen(false)
    } finally {
      setReportExporting(false)
    }
  }

  const handleShowReport = async () => {
    setReportViewLoading(true)
    setReportViewOpen(true)
    try {
      setReportViewData(await buildReportTable())
    } finally {
      setReportViewLoading(false)
    }
  }

  const handleAnnualPlanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAnnualPlanParsing(true)
    try {
      const plan = await parseAnnualPlanDocx(file)
      setAnnualPlanPreview(plan)
      setAnnualPlanOpen(true)
    } catch (err) {
      toast({
        title: 'Yıllık plan okunamadı',
        description: err instanceof Error ? err.message : 'Word belgesi beklenen MEB şablonunda değil.',
        variant: 'destructive',
      })
    } finally {
      setAnnualPlanParsing(false)
    }
  }

  const handleAnnualPlanSave = async () => {
    if (!annualPlanPreview) return
    setAnnualPlanSaving(true)
    try {
      await updateCourse(id, { annualPlan: annualPlanPreview })
      toast({ title: 'Yıllık plan kaydedildi', description: `${annualPlanPreview.items.length} hafta · ${annualPlanPreview.yil}` })
      setAnnualPlanOpen(false)
      setAnnualPlanPreview(null)
    } catch {
      toast({ title: 'Kaydedilemedi', variant: 'destructive' })
    } finally {
      setAnnualPlanSaving(false)
    }
  }

  return (
    <Layout
      title={pageTitle}
      showBack
      backTo="/courses"
      backTitle="Dersler"
      rightAction={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Ders menüsü"
          onClick={() => setCourseMenuOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      }
    >
      {excelParsing && (
        <div className="fixed inset-0 z-[600] bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="bg-card text-card-foreground p-6 rounded-2xl shadow-xl flex flex-col items-center max-w-sm w-full text-center space-y-4 border border-border">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold tracking-tight">Sınıf Listesi İndiriliyor</h3>
              <p className="text-sm text-muted-foreground">
                Lütfen bekleyin, şablon otomatik olarak sunucudan alınıyor ve ekranınıza taşınıyor...
              </p>
            </div>
          </div>
        </div>
      )}
      {annualPlanParsing && (
        <div className="fixed inset-0 z-[600] bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="bg-card text-card-foreground p-6 rounded-2xl shadow-xl flex flex-col items-center max-w-sm w-full text-center space-y-4 border border-border">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold tracking-tight">Yıllık plan okunuyor</h3>
              <p className="text-sm text-muted-foreground">Word belgesindeki haftalık kazanımlar çıkarılıyor...</p>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-4">
        {/* Applications Section — liste ile birlikte kayar */}
        <div className="space-y-0">
        <div className="-mx-4 px-4 py-1.5 -mt-4 border-b border-border/40">
          <div className="flex items-center gap-2 min-h-11">
            {appsLoading ? (
              <>
                <div className="flex-1 flex justify-center py-2"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                <button
                  type="button"
                  onClick={() => setAddAppOpen(true)}
                  className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 text-white border border-blue-500/30 shadow-[0_4px_10px_rgba(37,99,235,0.45)] flex items-center justify-center"
                  aria-label="Uygulama Ekle"
                >
                  <Plus size={24} strokeWidth={2.5} />
                </button>
              </>
            ) : applications.length === 0 ? (
              <div className="flex-1 py-4 text-center text-muted-foreground text-xs italic border border-dashed rounded-lg bg-white/50">
                Henüz uygulama eklenmedi.
              </div>
            ) : (
              <div className="relative min-h-11 w-full">
                <div className="flex items-center gap-2 overflow-x-auto min-w-0 pr-11 [scrollbar-width:thin]">
                  {applications.map((app) => (
                    <button
                      key={app.id}
                      onClick={(e) => handleAppSelect(app, e)}
                      onContextMenu={(e) => handleAppContextMenu(e, app)}
                      className={`shrink-0 text-left px-3 py-2 rounded-xl border text-sm transition-all duration-300 select-none overflow-hidden ${selectedApp?.id === app.id
                        ? 'w-[140px] bg-primary text-primary-foreground border-primary shadow-md'
                        : 'w-[112px] bg-white border-border hover:border-primary/50'
                        }`}
                    >
                      <div className="font-medium truncate">{app.ad}</div>
                      <div className={`text-[11px] mt-0.5 truncate ${selectedApp?.id === app.id ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                        {format(new Date(app.tarih + 'T12:00:00'), 'd MMM yyyy', { locale: tr })}
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setAddAppOpen(true)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 shrink-0 w-10 h-10 rounded-full transition-all duration-200 z-10 bg-gradient-to-b from-blue-400 to-blue-600 text-white border border-blue-500/30 shadow-[0_4px_10px_rgba(37,99,235,0.45)] hover:from-blue-400 hover:to-blue-500 hover:-translate-y-[calc(50%+2px)] active:translate-y-[calc(-50%+2px)] active:shadow-[0_2px_6px_rgba(37,99,235,0.4)] active:from-blue-500 active:to-blue-600 flex items-center justify-center"
                  aria-label="Uygulama Ekle"
                >
                  <Plus size={24} strokeWidth={2.5} className="drop-shadow-md" />
                </button>
              </div>
            )}
            {applications.length === 0 && !appsLoading && (
              <button
                onClick={() => setAddAppOpen(true)}
                className="shrink-0 self-center w-10 h-10 rounded-full transition-all duration-200 bg-gradient-to-b from-blue-400 to-blue-600 text-white border border-blue-500/30 shadow-[0_4px_10px_rgba(37,99,235,0.45)] hover:from-blue-400 hover:to-blue-500 flex items-center justify-center"
                aria-label="Uygulama Ekle"
              >
                <Plus size={24} strokeWidth={2.5} className="drop-shadow-md" />
              </button>
            )}
          </div>
        </div>
        <AnnualPlanBanner plan={course?.annualPlan} />
        {/* Students Section */}
        <div>
          {studentsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : students.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Henüz öğrenci eklenmedi.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2" ref={studentsContainerRef}>
              <div
                ref={stickyHeaderRef}
                className="sticky top-14 z-30 -mx-4 px-4 py-1.5 mb-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40 shadow-sm flex items-end gap-2 -mt-px"
              >
                <div className="flex flex-col items-center shrink-0 gap-0.5">
                  <span className="text-[10px] font-bold tabular-nums leading-none text-slate-600 min-h-[11px] whitespace-nowrap">
                    {displayedStudents.length} öğrenci
                  </span>
                  {displayedDevamsizCount !== null ? (
                    <button
                      type="button"
                      onClick={() => setDevamsizListOpen(true)}
                      className="text-[10px] font-bold tabular-nums leading-none text-destructive/90 min-h-[11px] whitespace-nowrap underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
                      title="Devamsız öğrenci listesini aç"
                    >
                      {displayedDevamsizCount} devamsız
                    </button>
                  ) : (
                    <span className="min-h-[11px]" aria-hidden />
                  )}
                  <Select value={studentSortKey} onValueChange={(v) => setStudentSortKey(v as StudentListSortKey)}>
                    <SelectTrigger className="h-9 w-[96px] shrink-0 text-xs font-semibold gap-1 px-2">
                      <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <SelectValue placeholder="Sırala" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">Öğr No</SelectItem>
                      <SelectItem value="pcNo">PC No</SelectItem>
                      <SelectItem value="adSoyad">Ad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col items-center shrink-0 gap-0.5">
                  {scoreProgress ? (
                    <span className="text-[10px] font-bold tabular-nums leading-none text-slate-600 min-h-[11px]">
                      {scoreProgress.empty} boş
                    </span>
                  ) : (
                    <span className="min-h-[11px]" aria-hidden />
                  )}
                  <Button
                    type="button"
                    variant={onlyBos ? 'default' : 'outline'}
                    size="sm"
                    disabled={!selectedApp}
                    onClick={() => setOnlyBos((v) => !v)}
                    className="h-9 shrink-0 px-2 text-xs font-bold min-w-[3.25rem]"
                    title={
                      scoreProgress
                        ? `${scoreProgress.empty} öğrencinin puanı girilmedi`
                        : 'Önce bir uygulama seçin'
                    }
                  >
                    Boşlar
                  </Button>
                </div>
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Akıllı arama (ad, no, PC)..."
                    className="h-9 pl-8 pr-8 text-xs"
                  />
                  {studentSearch && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setStudentSearch('')}
                      aria-label="Aramayı temizle"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {displayedStudents.length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-center text-muted-foreground text-sm">
                    {onlyBos && selectedApp
                      ? 'Puanı girilmemiş öğrenci kalmadı.'
                      : 'Aramanızla eşleşen öğrenci yok.'}
                  </CardContent>
                </Card>
              ) : (
                displayedStudents.map((student) => (
                <StudentRow
                  key={student.id}
                  student={student}
                  selectedApp={selectedApp}
                  score={scores[student.id]}
                  scoresLoading={scoresLoading}
                  onScoreChange={handleScoreChange}
                  onDevamsiz={handleDevamsizToggle}
                  onKisaNotChange={handleKisaNotChange}
                  onCamera={openCamera}
                  onFileUpload={handleFileUpload}
                  onPhotoDelete={handlePhotoDelete}
                  onNavigate={() => navigate(`/courses/${id}/students/${student.id}`)}
                  dataStudentId={student.id}
                  onNumpadOpen={setNumpadOpenFor}
                />
                ))
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Add Application Dialog */}
      <Dialog open={addAppOpen} onOpenChange={setAddAppOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>Uygulama Ekle</DialogTitle></DialogHeader>
          <form onSubmit={handleAddApp} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="appAd">Uygulama Adı</Label>
              <Input id="appAd" placeholder={nextAppName} value={appForm.ad}
                onChange={(e) => setAppForm({ ...appForm, ad: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appTarih">Tarih *</Label>
              <Input id="appTarih" type="date" value={appForm.tarih}
                className="block w-full appearance-none"
                onChange={(e) => setAppForm({ ...appForm, tarih: e.target.value })} required />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddAppOpen(false)}>İptal</Button>
              <Button type="submit" disabled={appSaving}>
                {appSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ekle
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Application Dialog */}
      <Dialog open={editAppOpen} onOpenChange={setEditAppOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Uygulamayı Düzenle</DialogTitle>
            <DialogDescription>
              Uygulama adını ve tarihini güncelleyin veya uygulamayı tamamen silin.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditApp} className="space-y-4 pt-2">
            <div className="flex gap-4 items-start">
              <div className="flex flex-col gap-2 shrink-0">
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border overflow-hidden flex items-center justify-center relative bg-accent/30">
                  {appForm.foto ? (
                    <OfflineImage src={appForm.foto} alt="Uygulama Kapak" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center text-muted-foreground flex flex-col items-center">
                      <Camera className="w-6 h-6 mb-1 opacity-50" />
                      <span className="text-[10px] font-medium leading-tight">Fotoğraf<br/>Ekle</span>
                    </div>
                  )}
                  {photoUploading && cameraStudentId === 'APP_COVER_EDIT' && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center backdrop-blur-[1px]">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="outline" className="flex-1 px-0 h-8" onClick={() => openCamera('APP_COVER_EDIT')} title="Kameradan Çek">
                    <Camera className="w-4 h-4" />
                  </Button>
                  <label className="flex-1 cursor-pointer">
                    <div className="h-8 inline-flex w-full items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground" title="Dosyadan Yükle">
                      <Upload className="w-4 h-4" />
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleAppFileUpload} />
                  </label>
                </div>
              </div>
              
              <div className="flex-1 flex flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editAppAd">Uygulama Adı *</Label>
                  <Input id="editAppAd" placeholder="1. Uygulama" value={appForm.ad}
                    onChange={(e) => setAppForm({ ...appForm, ad: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editAppTarih">Tarih *</Label>
                  <Input id="editAppTarih" type="date" value={appForm.tarih}
                    className="block w-full appearance-none"
                    onChange={(e) => setAppForm({ ...appForm, tarih: e.target.value })} required />
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                onClick={() => {
                  setEditAppOpen(false)
                  setDeleteAppConfirmOpen(true)
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Sil
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditAppOpen(false)}>İptal</Button>
                <Button type="submit" disabled={appSaving}>
                  {appSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Güncelle
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteAppConfirmOpen}
        onOpenChange={setDeleteAppConfirmOpen}
        title="Uygulamayı Sil"
        description={`"${appToEdit?.ad}" uygulamasını silmek istediğinize emin misiniz? Bu uygulamaya ait tüm öğrenci puanları ve fotoğrafları da silinecektir.`}
        confirmText="Sil"
        variant="destructive"
        onConfirm={handleDeleteApp}
      />

      {/* Add Student Dialog */}
      <Dialog open={addStudentOpen} onOpenChange={(open) => {
        setAddStudentOpen(open)
        if (!open) {
          setStudentForm(EMPTY_STUDENT)
          clearNewStudentPhoto()
        }
      }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Öğrenci Ekle</DialogTitle></DialogHeader>
          <Tabs defaultValue="tekli">
            <TabsList className="w-full">
              <TabsTrigger value="tekli" className="flex-1">Tekli Ekle</TabsTrigger>
              <TabsTrigger value="excel" className="flex-1">Excel ile Ekle</TabsTrigger>
              <TabsTrigger value="hazir" className="flex-1 font-semibold text-primary">Hazır Liste</TabsTrigger>
            </TabsList>
            <TabsContent value="tekli">
              <form onSubmit={handleAddStudent} className="space-y-3 mt-2">
                <div className="flex gap-3 items-start">
                  <div className="flex flex-col gap-2 shrink-0">
                    <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border overflow-hidden flex items-center justify-center relative bg-accent/30">
                      {newStudentPhotoPreview ? (
                        <img src={newStudentPhotoPreview} alt="Öğrenci fotoğrafı" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center text-muted-foreground flex flex-col items-center">
                          <Camera className="w-5 h-5 mb-0.5 opacity-50" />
                          <span className="text-[10px] font-medium leading-tight">Fotoğraf</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" size="sm" variant="outline" className="flex-1 px-0 h-8" onClick={() => openCamera('NEW_STUDENT')} title="Kameradan çek">
                        <Camera className="w-4 h-4" />
                      </Button>
                      <label className="flex-1 cursor-pointer">
                        <div className="h-8 inline-flex w-full items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground" title="Dosyadan yükle">
                          <Upload className="w-4 h-4" />
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleNewStudentFileUpload} />
                      </label>
                      {newStudentPhotoPreview && (
                        <Button type="button" size="sm" variant="outline" className="px-0 h-8 w-8" onClick={clearNewStudentPhoto} title="Fotoğrafı kaldır">
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 min-w-0">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="sNo">No *</Label>
                        <Input id="sNo" placeholder="1" value={studentForm.no}
                          onChange={(e) => setStudentForm({ ...studentForm, no: e.target.value })} required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="sPcNo">PC No</Label>
                        <Input id="sPcNo" placeholder="PC01" value={studentForm.pcNo}
                          onChange={(e) => setStudentForm({ ...studentForm, pcNo: formatClassName(e.target.value) })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sAdSoyad">Ad Soyad *</Label>
                      <Input id="sAdSoyad" placeholder="Ayşe Yılmaz" value={studentForm.adSoyad}
                        onChange={(e) => setStudentForm({ ...studentForm, adSoyad: formatTitleCase(e.target.value) })} required />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddStudentOpen(false)}>İptal</Button>
                  <Button type="submit" disabled={studentSaving}>
                    {studentSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ekle
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
            <TabsContent value="hazir">
              <div className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">
                  Sunucuda tanımlı olan sınıf listelerinden birini seçerek öğrencileri topluca ekleyin.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={selGrade} onValueChange={setSelGrade}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sınıf" />
                    </SelectTrigger>
                    <SelectContent side="bottom">
                      {grades.map(g => (
                        <SelectItem key={g} value={g}>{g}. Sınıf</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selSection} onValueChange={setSelSection}>
                    <SelectTrigger>
                      <SelectValue placeholder="Şube" />
                    </SelectTrigger>
                    <SelectContent side="bottom">
                      {sections.map(s => (
                        <SelectItem key={s} value={s}>{s} Şubesi</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  className="w-full" 
                  disabled={!selGrade || !selSection || excelParsing}
                  onClick={() => loadTemplate(selGrade + selSection)}
                >
                  {excelParsing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Listeyi İndir ve Önizle
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="excel">
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Fotoğraflı veya düz formatlı Excel dosyası yükleyin.
                  Hücrelerde <strong>"Ad Soyad + Numara"</strong> formatı otomatik algılanır.
                </p>
                {excelError && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{excelError}</span>
                  </div>
                )}
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors">
                  {excelParsing ? (
                    <>
                      <Loader2 className="h-8 w-8 text-primary mb-2 animate-spin" />
                      <span className="text-sm text-primary">Dosya okunuyor...</span>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-8 w-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">Excel dosyası seç (.xlsx)</span>
                    </>
                  )}
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} disabled={excelParsing} />
                </label>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Camera Dialog */}
      <Dialog open={cameraOpen} onOpenChange={closeCamera}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Fotoğraf Çek</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg bg-black aspect-[4/3] object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            <Button className="w-full" onClick={takePhoto} disabled={photoUploading}>
              {photoUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              {photoUploading ? 'Yükleniyor...' : 'Fotoğraf Çek'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Report Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rapor Al</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Rapor Başlığı</Label>
              <Input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} placeholder="Rapor Başlığı" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Başlangıç Tarihi</Label>
                <Input type="date" value={reportRange.from}
                  onChange={(e) => setReportRange({ ...reportRange, from: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Bitiş Tarihi</Label>
                <Input type="date" value={reportRange.to}
                  onChange={(e) => setReportRange({ ...reportRange, to: e.target.value })} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {applications.filter(a => a.tarih >= reportRange.from && a.tarih <= reportRange.to).length} uygulama raporlanacak.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button className="w-full" variant="secondary" onClick={handleShowReport} disabled={reportViewLoading || reportExporting}>
              {reportViewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Göster
            </Button>
            <div className="flex w-full gap-2">
              <Button className="flex-1" variant="outline" onClick={() => setReportOpen(false)}>İptal</Button>
              <Button className="flex-1" onClick={handleReport} disabled={reportExporting || reportViewLoading}>
                {reportExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Excel İndir
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportViewOpen} onOpenChange={setReportViewOpen}>
        <DialogContent className="max-w-[95vw] w-full p-4 gap-3">
          <DialogHeader>
            <DialogTitle>Performans Analizi</DialogTitle>
            <DialogDescription className="sr-only">Excel raporuyla aynı tablo görünümü</DialogDescription>
          </DialogHeader>
          {reportViewLoading || !reportViewData ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-auto max-h-[min(70dvh,640px)] rounded-lg border border-border">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th colSpan={4 + reportViewData.apps.length} className="bg-[#1F4E78] text-white font-bold text-center py-3 px-3 whitespace-normal leading-snug">
                      {reportTitle}
                    </th>
                  </tr>
                  <tr className="bg-blue-500 text-white">
                    <th className="py-2 px-2 font-semibold text-center border border-blue-400/40">No</th>
                    <th className="py-2 px-2 font-semibold text-left border border-blue-400/40">Ad Soyad</th>
                    <th className="py-2 px-2 font-semibold text-center border border-blue-400/40">PC No</th>
                    {reportViewData.apps.map((a) => (
                      <th key={a.id} className="py-2 px-2 font-semibold text-center border border-blue-400/40 min-w-[88px] leading-tight">
                        <div>{a.ad}</div>
                        <div className="text-[10px] font-normal opacity-90">{format(new Date(a.tarih), 'dd.MM.yyyy')}</div>
                      </th>
                    ))}
                    <th className="py-2 px-2 font-semibold text-center border border-blue-400/40">ORT</th>
                  </tr>
                </thead>
                <tbody>
                  {reportViewData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={4 + reportViewData.apps.length} className="py-8 text-center text-muted-foreground">
                        Gösterilecek öğrenci yok.
                      </td>
                    </tr>
                  ) : (
                    reportViewData.rows.map((row) => (
                      <tr key={`${row.no}-${row.adSoyad}`} className="odd:bg-white even:bg-slate-50/60">
                        <td className="py-1.5 px-2 border border-slate-200">{row.no}</td>
                        <td className="py-1.5 px-2 border border-slate-200 whitespace-nowrap">{row.adSoyad}</td>
                        <td className="py-1.5 px-2 border border-slate-200 text-center">{row.pcNo}</td>
                        {row.scores.map((score, i) => (
                          <td key={reportViewData.apps[i]?.id ?? i} className={`py-1.5 px-2 border border-slate-200 text-center ${reportScoreClass(score)}`}>
                            {score}
                          </td>
                        ))}
                        <td className={`py-1.5 px-2 border border-slate-200 text-center bg-slate-50 font-bold ${reportScoreClass(row.ortalama)}`}>
                          {row.ortalama}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportViewOpen(false)}>Kapat</Button>
            <Button
              onClick={async () => {
                if (!reportViewData) return
                setReportExporting(true)
                try {
                  await exportReportExcel(reportViewData)
                } finally {
                  setReportExporting(false)
                }
              }}
              disabled={reportExporting || reportViewLoading || !reportViewData}
            >
              {reportExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Excel İndir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={(open) => { if (!open) handlePreviewCancel() }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Excel Önizleme — {parsedStudents.length} öğrenci</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {parsedStudents.map((s, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg border border-border bg-accent/20">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
                  {previewUrls[i] ? (
                    <img src={previewUrls[i]} alt={s.adSoyad} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-primary font-semibold text-xs">
                      {s.adSoyad.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{formatTitleCase(s.adSoyad)}</div>
                  <div className="text-xs text-muted-foreground">No: {s.no}</div>
                </div>
                {s.foto && (
                  <span className="text-xs text-green-600 flex items-center gap-0.5">
                    <Check className="h-3 w-3" /> Foto
                  </span>
                )}
              </div>
            ))}
          </div>
          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={handlePreviewCancel} disabled={excelSaving}>İptal</Button>
            <Button onClick={handlePreviewConfirm} disabled={excelSaving}>
              {excelSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {excelSaving ? 'Kaydediliyor...' : `${parsedStudents.length} Öğrenci Ekle`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={devamsizListOpen} onOpenChange={setDevamsizListOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Devamsız öğrenciler</DialogTitle>
            <DialogDescription>
              {selectedApp
                ? `${selectedApp.ad} · ${devamsizStudentsList.length} öğrenci uygulamada yok (D)`
                : 'Uygulama seçilmedi'}
            </DialogDescription>
          </DialogHeader>
          <Card className="shadow-sm">
            <CardContent className="p-0 max-h-[min(60vh,320px)] overflow-y-auto">
              {devamsizStudentsList.length === 0 ? (
                <p className="py-6 px-4 text-center text-sm text-muted-foreground">Devamsız öğrenci yok.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {devamsizStudentsList.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-muted/60 transition-colors"
                        onClick={() => {
                          setDevamsizListOpen(false)
                          navigate(`/courses/${id}/students/${s.id}`)
                        }}
                      >
                        <div className="w-9 h-9 shrink-0 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
                          {s.foto ? (
                            <OfflineImage src={s.foto} alt={s.adSoyad} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-primary font-semibold text-xs">
                              {s.adSoyad.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                            </span>
                          )}
                        </div>
                        <span className="flex-1 min-w-0 font-medium truncate">{s.adSoyad}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums text-right">
                          {s.no}
                          {s.pcNo ? ` · PC ${s.pcNo}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      <Dialog open={courseMenuOpen} onOpenChange={setCourseMenuOpen}>
        <DialogContent className="max-w-xs gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-base">Ders işlemleri</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col p-2 pt-0 gap-1">
            <div className="rounded-xl overflow-hidden">
            <Button
              variant="ghost"
              className="h-11 w-full justify-start gap-3 rounded-none rounded-t-xl text-sm font-semibold"
              onClick={() => {
                setCourseMenuOpen(false)
                navigate(`/courses/${id}/seating`, {
                  state: selectedApp
                    ? { applicationId: selectedApp.id, applicationAd: selectedApp.ad }
                    : undefined,
                })
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-blue-600" aria-hidden>
                <rect x="3" y="18" width="4" height="4" rx="1" fill="currentColor" />
                <rect x="3" y="11" width="4" height="4" rx="1" fill="currentColor" />
                <rect x="3" y="4" width="4" height="4" rx="1" fill="currentColor" />
                <rect x="10" y="4" width="4" height="4" rx="1" fill="currentColor" />
                <rect x="17" y="4" width="4" height="4" rx="1" fill="currentColor" />
                <rect x="17" y="11" width="4" height="4" rx="1" fill="currentColor" />
                <rect x="17" y="18" width="4" height="4" rx="1" fill="currentColor" />
              </svg>
              Oturma Düzeninde Aç
            </Button>
            <label className="flex items-center gap-3 px-4 pb-2.5 -mt-1 text-[11px] font-medium text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 accent-primary"
                checked={!!course?.openSeatingByDefault}
                onChange={async (e) => {
                  if (!course) return
                  const next = e.target.checked
                  try {
                    await updateCourse(id, { openSeatingByDefault: next })
                    toast({
                      title: next ? 'Varsayılan: oturma düzeni' : 'Varsayılan kapatıldı',
                      description: next
                        ? 'Derslerim’den bu derse girince oturma düzeni açılacak.'
                        : 'Derslerim’den bu derse girince liste görünümü açılacak.',
                    })
                  } catch {
                    toast({ title: 'Kaydedilemedi', variant: 'destructive' })
                  }
                }}
              />
              Bu Dersi Hep Oturma Düzeninde Aç
            </label>
            </div>
            <Button
              variant="ghost"
              className="h-11 justify-start gap-3 rounded-xl text-sm font-semibold"
              onClick={() => {
                setCourseMenuOpen(false)
                setReportOpen(true)
              }}
            >
              <FileText className="h-[18px] w-[18px] shrink-0 text-blue-600" />
              Performans analizi
            </Button>
            <Button
              variant="ghost"
              className="h-11 justify-start gap-3 rounded-xl text-sm font-semibold"
              onClick={() => {
                setCourseMenuOpen(false)
                setAddStudentOpen(true)
              }}
            >
              <UserPlus className="h-[18px] w-[18px] shrink-0 text-blue-600" />
              Öğrenci ekle
            </Button>
            <Button
              variant="ghost"
              className="h-11 justify-start gap-3 rounded-xl text-sm font-semibold"
              onClick={() => {
                setCourseMenuOpen(false)
                annualPlanFileRef.current?.click()
              }}
            >
              <CalendarDays className="h-[18px] w-[18px] shrink-0 text-blue-600" />
              Yıllık plan yükle
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <input
        ref={annualPlanFileRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleAnnualPlanFile}
      />

      <Dialog open={annualPlanOpen} onOpenChange={(open) => {
        setAnnualPlanOpen(open)
        if (!open) setAnnualPlanPreview(null)
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yıllık plan</DialogTitle>
            <DialogDescription>
              {annualPlanPreview
                ? `${annualPlanPreview.yil} · ${annualPlanPreview.items.length} hafta`
                : 'MEB e-Yıllık Plan Word belgesi'}
            </DialogDescription>
          </DialogHeader>
          {annualPlanPreview && (
            <div className="max-h-[50vh] overflow-y-auto rounded-md border divide-y text-sm">
              {annualPlanPreview.items.slice(0, 12).map((row) => (
                <div key={`${row.hafta}-${row.tarihBas}`} className="px-3 py-2">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    {row.hafta} · {row.tarihBas.slice(8)}–{row.tarihBit.slice(8)}
                  </div>
                  <div className="font-medium line-clamp-1">{row.konu || row.unite}</div>
                  {row.kazanim && <div className="text-xs text-muted-foreground line-clamp-2">{row.kazanim}</div>}
                </div>
              ))}
              {annualPlanPreview.items.length > 12 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  +{annualPlanPreview.items.length - 12} hafta daha
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAnnualPlanOpen(false); setAnnualPlanPreview(null) }}>
              İptal
            </Button>
            <Button onClick={handleAnnualPlanSave} disabled={!annualPlanPreview || annualPlanSaving}>
              {annualPlanSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Numpad */}
      <SmartNumpad
        isOpen={!!numpadOpenFor}
        onClose={() => setNumpadOpenFor(null)}
        value={numpadOpenFor ? (scores[numpadOpenFor]?.puan?.toString() ?? '') : ''}
        student={numpadOpenFor ? students.find(s => s.id === numpadOpenFor) : undefined}
        onChange={(val) => {
          if (numpadOpenFor) {
            handleScoreChange(numpadOpenFor, val)
          }
        }}
      />
    </Layout>
  )
}

interface StudentRowProps {
  student: Student
  selectedApp: Application | null
  score?: Score
  scoresLoading: boolean
  onScoreChange: (studentId: string, puan: string) => void
  onDevamsiz: (studentId: string) => void
  onKisaNotChange: (studentId: string, kisaNot: string) => void
  onCamera: (studentId: string) => void
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>, studentId: string) => void
  onPhotoDelete: (studentId: string, photoUrl: string) => void
  onNavigate: () => void
  dataStudentId?: string // Container'dan id'yi yakalamak için prop
  onNumpadOpen: (studentId: string) => void
}

function StudentRow({ student, selectedApp, score, scoresLoading, onScoreChange: _, onDevamsiz, onKisaNotChange, onCamera, onFileUpload, onPhotoDelete, onNavigate, dataStudentId, onNumpadOpen }: StudentRowProps) {
  const [isZoomed, setIsZoomed] = useState(false)
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [kisaNotOpen, setKisaNotOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const appPhotos = getScoreKameraFotolar(score)
  const kanitSayilari = getScoreKanitSayilari(score)
  const canAddPhoto = appPhotos.length < MAX_UYGULAMA_FOTO
  const hasPuan = studentHasPuan(score)
  const kanitBadge =
    'inline-flex items-center gap-0.5 min-w-[1.85rem] rounded-sm border border-border/50 bg-background px-0.5 py-px text-[9px] font-semibold leading-none text-muted-foreground tabular-nums shadow-sm shrink-0'
  const hasKanitRozet =
    kanitSayilari.kamera > 0 || kanitSayilari.dosya > 0 || kanitSayilari.not > 0
  const devamsizVePuan = !!score?.devamsiz && scoreHasEnteredPuan(score)

  return (
    <div data-student-id={dataStudentId} className="scroll-mt-[108px]">
      <Card
        className={`relative overflow-visible ${
          score?.devamsiz
            ? 'border-destructive/40 bg-destructive/5'
            : hasPuan
              ? 'bg-slate-200/90 border-slate-300'
              : ''
        }`}
      >
        {devamsizVePuan && (
          <span
            className="absolute top-1.5 left-1.5 z-10 flex h-5 w-5 -translate-x-1 -translate-y-1 items-center justify-center rounded-full bg-yellow-100 border border-yellow-400 text-yellow-700 shadow-sm"
            title="Devamsız öğrenciye uygulama puanı girilmiş"
            aria-label="Devamsız öğrenciye uygulama puanı girilmiş"
          >
            <AlertTriangle className="h-3 w-3 fill-yellow-200" />
          </span>
        )}
        <CardContent className="p-3">
          <div className="flex items-center gap-2 overflow-visible">
            <div
              className={`w-9 h-9 flex items-center justify-center shrink-0 cursor-pointer transition-all duration-300 origin-left ${isZoomed ? 'scale-[4] z-50 shadow-xl relative rounded-md overflow-hidden bg-background' : 'rounded-full overflow-hidden bg-primary/10'}`}
              onClick={(e) => {
                e.stopPropagation()
                setIsZoomed(!isZoomed)
              }}
              title={isZoomed ? 'Küçült' : 'Büyüt'}
            >
              {student.foto ? (
                <OfflineImage src={student.foto} alt={student.adSoyad} className="w-full h-full object-cover" />
              ) : (
                <span className={`text-primary font-semibold ${isZoomed ? 'text-[5px]' : 'text-xs'}`}>
                  {student.adSoyad.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={onNavigate}>
                <div className="font-medium text-sm truncate flex items-center gap-1.5">
                  <span className="truncate">{student.adSoyad}</span>
                  {student.bep && <span className="text-muted-foreground/50 font-normal text-xs shrink-0">(BEP)</span>}
                  {(student.behaviorStars?.yellow ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-yellow-600 bg-yellow-50 px-1 py-0.5 rounded-full border border-yellow-200 shrink-0">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-500" />
                      x{student.behaviorStars!.yellow}
                    </span>
                  )}
                  {(student.behaviorStars?.purple ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-purple-600 bg-purple-50 px-1 py-0.5 rounded-full border border-purple-200 shrink-0">
                      <StarOff className="w-3 h-3 text-purple-500" />
                      x{student.behaviorStars!.purple}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="text-black font-medium">{student.no}</span>
                  {student.pcNo && ` · PC: ${student.pcNo}`}
                </div>
              </div>

              {selectedApp && (
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Input
                    type="text"
                    readOnly
                    placeholder="Puan"
                    value={score?.puan ?? ''}
                    onClick={() => onNumpadOpen(student.id)}
                    disabled={scoresLoading}
                    className={`w-14 h-8 text-sm text-center cursor-pointer px-1 ${
                      score?.puan !== null && score?.puan !== undefined && String(score.puan) !== ''
                        ? 'bg-sky-50 border-sky-200'
                        : 'bg-white'
                    }`}
                  />
                  <Button
                    size="icon"
                    variant={score?.devamsiz ? 'destructive' : 'outline'}
                    className="h-8 w-8 text-xs font-bold shrink-0"
                    onClick={() => onDevamsiz(student.id)}
                    title="Devamsız"
                  >
                    D
                  </Button>
                </div>
              )}
            </div>

            {selectedApp && (
              <div
                className="flex items-center gap-0.5 shrink-0 -mr-1"
                aria-label={
                  hasKanitRozet
                    ? `Kamera ${kanitSayilari.kamera}, dosya ${kanitSayilari.dosya}, not ${kanitSayilari.not}`
                    : undefined
                }
              >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground"
                    onClick={(e) => e.stopPropagation()}
                    title="Diğer işlemler"
                    aria-label="Diğer işlemler"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem disabled={!canAddPhoto} onClick={() => onCamera(student.id)}>
                    <Camera className="h-4 w-4" />
                    Fotoğraf çek
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canAddPhoto}
                    onSelect={(e) => {
                      e.preventDefault()
                      fileInputRef.current?.click()
                    }}
                  >
                    <Upload className="h-4 w-4" />
                    Dosyadan yükle
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setKisaNotOpen(true)}>
                    <FileText className="h-4 w-4" />
                    Kısa not{(score?.kisaNot ?? '').trim() ? ' · dolu' : ''}
                  </DropdownMenuItem>
                  {appPhotos.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      {appPhotos.map((photoUrl, i) => (
                        <DropdownMenuItem key={photoUrl} onClick={() => setZoomPhotoUrl(photoUrl)}>
                          <ImageIcon className="h-4 w-4" />
                          Kanıt {i + 1}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
                {hasKanitRozet && (
                  <div className="flex flex-col items-start gap-0.5">
                    {kanitSayilari.kamera > 0 && (
                      <span className={kanitBadge} title="Çekilen fotoğraf">
                        <Camera className="h-2.5 w-2.5 shrink-0" />
                        {kanitSayilari.kamera}
                      </span>
                    )}
                    {kanitSayilari.dosya > 0 && (
                      <span className={kanitBadge} title="Yüklenen dosya">
                        <Upload className="h-2.5 w-2.5 shrink-0" />
                        {kanitSayilari.dosya}
                      </span>
                    )}
                    {kanitSayilari.not > 0 && (
                      <span className={kanitBadge} title="Kısa not">
                        <FileText className="h-2.5 w-2.5 shrink-0" />
                        {kanitSayilari.not}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={!canAddPhoto}
            onChange={(e) => onFileUpload(e, student.id)}
          />

          <Dialog open={kisaNotOpen} onOpenChange={setKisaNotOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Kısa not</DialogTitle>
                <DialogDescription className="sr-only">{student.adSoyad} için uygulama notu</DialogDescription>
              </DialogHeader>
              <Input
                placeholder="Kısa not..."
                value={score?.kisaNot ?? ''}
                onChange={(e) => onKisaNotChange(student.id, e.target.value)}
                className="text-sm"
                autoFocus
              />
              <DialogFooter>
                <Button type="button" onClick={() => setKisaNotOpen(false)}>
                  Tamam
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!zoomPhotoUrl} onOpenChange={(open) => { if (!open) setZoomPhotoUrl(null) }}>
            <DialogContent className="max-w-[90vw] md:max-w-2xl bg-black/95 border-none p-0 overflow-visible shadow-2xl [&>button]:hidden">
              <DialogTitle className="sr-only">Fotoğrafı Büyüt</DialogTitle>
              <DialogDescription className="sr-only">Öğrencinin uygulama fotoğrafının büyük hali</DialogDescription>
              {zoomPhotoUrl && (
                <div className="relative w-full flex items-center justify-center min-h-[30vh]">
                  <OfflineImage
                    src={zoomPhotoUrl}
                    alt="Uygulama Fotoğrafı"
                    className="max-w-full max-h-[50vh] object-contain rounded-md"
                  />
                  <div className="absolute -top-4 -right-4 flex items-center gap-2 z-50">
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-10 w-10 rounded-full shadow-xl border-2 border-background hover:bg-destructive hover:scale-105 transition-transform cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDeleteConfirmOpen(true)
                      }}
                      title="Fotoğrafı sil"
                    >
                      <Trash2 className="h-5 w-5 text-white" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-10 w-10 rounded-full shadow-xl border-2 border-background hover:scale-105 transition-transform cursor-pointer bg-white text-slate-700 hover:bg-slate-100"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setZoomPhotoUrl(null)
                      }}
                      title="Kapat"
                      aria-label="Fotoğrafı kapat"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <ConfirmDialog
            open={deleteConfirmOpen}
            onOpenChange={setDeleteConfirmOpen}
            title="Fotoğrafı Sil"
            description="Bu fotoğrafı silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
            confirmText="Sil"
            variant="destructive"
            onConfirm={() => {
              if (zoomPhotoUrl) onPhotoDelete(student.id, zoomPhotoUrl)
              setZoomPhotoUrl(null)
              setDeleteConfirmOpen(false)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
