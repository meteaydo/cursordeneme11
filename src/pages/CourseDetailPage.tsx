import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { DialogDescription } from '@/components/ui/dialog'
import {
  Plus, Camera, Download, Loader2, UserPlus, FileSpreadsheet, Upload, AlertTriangle, Check, Trash2, Star, StarOff, LayoutGrid, FileText
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SmartNumpad } from '@/components/ui/smart-numpad'
import { useStudents } from '@/hooks/useStudents'
import { useApplications } from '@/hooks/useApplications'
import { queueImageUpload } from '@/lib/imageQueue'
import { OfflineImage } from '@/components/ui/OfflineImage'
import { toast } from '@/hooks/use-toast'
import type { Application, Score, Student, StudentFormData } from '@/types'
import ExcelJS from 'exceljs'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { formatTitleCase, formatClassName } from '@/lib/utils'
import { parseStudentExcel, type ParsedStudent } from '@/lib/excelStudentParser'

const EMPTY_STUDENT: StudentFormData = {
  no: '', adSoyad: '', pcNo: '', eskiPcNolari: [], ozelDurumNotlari: '', foto: '',
}

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const id = courseId!

  const state = location.state as { courseName?: string; className?: string } | null
  const pageTitle = state?.courseName ? `${state.courseName} - ${state.className}` : "Ders Uygulamaları"

  const { students, loading: studentsLoading, addStudent, addStudentsBulk, updateStudent } = useStudents(id)
  const { applications, loading: appsLoading, addApplication, updateApplication, deleteApplication, getScores, setScore } = useApplications(id)

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

  // App form
  const [appForm, setAppForm] = useState({ ad: '', tarih: format(new Date(), 'yyyy-MM-dd') })
  const [appSaving, setAppSaving] = useState(false)
  const [newlyAddedAppId, setNewlyAddedAppId] = useState<string | null>(null)

  // Student form
  const [studentForm, setStudentForm] = useState<StudentFormData>(EMPTY_STUDENT)
  const [studentSaving, setStudentSaving] = useState(false)

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

  // Scroll Anchoring refs
  const studentsContainerRef = useRef<HTMLDivElement>(null)
  const stickyHeaderRef = useRef<HTMLDivElement>(null)
  const scrollAnchorRef = useRef<{ id: string | null; prevTop: number; smoothAlign: boolean }>({
    id: null,
    prevTop: 0,
    smoothAlign: false
  })

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

  const handleAppSelect = (app: Application) => {
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
    setAppForm({ ad: app.ad, tarih: app.tarih })
    setEditAppOpen(true)
  }

  const handleEditApp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appToEdit) return
    setAppSaving(true)
    await updateApplication(appToEdit.id, { ad: appForm.ad, tarih: appForm.tarih })
    setEditAppOpen(false)
    setAppToEdit(null)
    setAppForm({ ad: '', tarih: format(new Date(), 'yyyy-MM-dd') })
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

  const handleAddApp = async (e: React.FormEvent) => {
    e.preventDefault()
    setAppSaving(true)
    const newId = await addApplication(appForm.ad, appForm.tarih)
    if (newId) setNewlyAddedAppId(newId)
    setAddAppOpen(false)
    setAppForm({ ad: '', tarih: format(new Date(), 'yyyy-MM-dd') })
    setAppSaving(false)
  }

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    setStudentSaving(true)
    await addStudent(studentForm)
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
      const existingNos = new Set(students.map(s => s.no))
      const newStudents = result.filter(s => !existingNos.has(s.no))

      if (newStudents.length === 0) {
        throw new Error('Dosyadaki tüm öğrenciler bu sınıfta zaten kayıtlı.')
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
      const mapped: StudentFormData[] = []
      const photoUploads: { index: number; blob: Blob }[] = []

      parsedStudents.forEach((s, i) => {
        // Önceden var olan öğrenci sayısına göre PC numarası atama ("PC01", "PC02" vb.)
        const pcIndex = students.length + i + 1
        const pcNoStr = `PC${String(pcIndex).padStart(2, '0')}`

        mapped.push({
          no: s.no,
          adSoyad: formatTitleCase(s.adSoyad),
          pcNo: pcNoStr,
          eskiPcNolari: [],
          ozelDurumNotlari: '',
          foto: '',
        })
        if (s.foto) photoUploads.push({ index: i, blob: s.foto })
      })

      const docIds = await addStudentsBulk(mapped)

      if (photoUploads.length > 0 && docIds.length > 0) {
        for (const pu of photoUploads) {
          const docId = docIds[pu.index]
          if (!docId) continue
          const key = `students/${docId}/foto.jpg`
          try {
            const localUrl = await queueImageUpload(pu.blob, key, {
              collection: `courses/${id}/students`,
              docId,
              field: 'foto'
            })
            await updateStudent(docId, { foto: localUrl })
          } catch {
            // foto yükleme hatası sessizce geçilir
          }
        }
      }

      Object.values(previewUrls).forEach(URL.revokeObjectURL)
      setPreviewUrls({})
      setParsedStudents([])
      setPreviewOpen(false)
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

  const handlePhotoDelete = async (studentId: string) => {
    if (!selectedApp) return
    
    await setScore(selectedApp.id, studentId, { kameraFoto: null })
    setScores((prev) => {
      const currentStudentScore = prev[studentId]
      if (!currentStudentScore) return prev
      
      const newScore = { ...currentStudentScore }
      delete newScore.kameraFoto
      
      return {
        ...prev,
        [studentId]: newScore,
      }
    })
  }

  // Camera functions
  const openCamera = async (studentId: string) => {
    setCameraStudentId(studentId)
    setCameraOpen(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
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
    if (!canvasRef.current || !videoRef.current || !selectedApp || !cameraStudentId) return
    const ctx = canvasRef.current.getContext('2d')!
    canvasRef.current.width = videoRef.current.videoWidth
    canvasRef.current.height = videoRef.current.videoHeight
    ctx.drawImage(videoRef.current, 0, 0)
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return
      uploadPhoto(blob, cameraStudentId)
    }, 'image/jpeg', 0.8)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, studentId: string) => {
    const file = e.target.files?.[0]
    if (!file || !selectedApp) return
    
    setCameraStudentId(studentId)
    uploadPhoto(file, studentId)
  }

  const uploadPhoto = async (fileOrBlob: Blob | File, sId: string) => {
    if (!selectedApp || !sId) return
    setPhotoUploading(true)

    // Anında gösterim için geçici URL oluştur
    const tempUrl = URL.createObjectURL(fileOrBlob)
    setScores((prev) => ({
      ...prev,
      [sId]: { ...prev[sId], kameraFoto: tempUrl },
    }))

    try {
      const key = `applications/${selectedApp.id}/${sId}.jpg`
      const localUrl = await queueImageUpload(fileOrBlob, key, {
        collection: `courses/${id}/applications/${selectedApp.id}/scores`,
        docId: sId,
        field: 'kameraFoto'
      })
      
      await setScore(selectedApp.id, sId, { kameraFoto: localUrl })
      
      // Geçici URL'i kalıcı local URL ile değiştir
      setScores((prev) => ({
        ...prev,
        [sId]: { ...prev[sId], kameraFoto: localUrl },
      }))
      closeCamera()
    } catch {
      toast({ title: 'Hata', description: 'Fotoğraf yüklenemedi.', variant: 'destructive' })
    } finally {
      setPhotoUploading(false)
      setCameraStudentId(null)
    }
  }

  // Report export
  const handleReport = async () => {
    const filteredApps = applications.filter(
      (a) => a.tarih >= reportRange.from && a.tarih <= reportRange.to,
    )
    
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Rapor')

    // Sütun genişlikleri
    ws.getColumn(1).width = 10
    ws.getColumn(2).width = 30
    ws.getColumn(3).width = 10
    for (let i = 0; i < filteredApps.length; i++) {
      ws.getColumn(4 + i).width = 15
    }

    // Başlık
    const totalCols = 3 + filteredApps.length
    ws.mergeCells(1, 1, 1, totalCols)
    const titleCell = ws.getCell(1, 1)
    titleCell.value = reportTitle
    titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
    ws.getRow(1).height = 30

    // Sütun Başlıkları
    const headers = ['No', 'Ad Soyad', 'PC No', ...filteredApps.map((a) => `${a.ad}\n(${format(new Date(a.tarih), 'dd.MM.yyyy')})`)]
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

    // Veriler
    students.forEach((s) => {
      const row = [
        s.no, s.adSoyad, s.pcNo,
        ...filteredApps.map((_a) => {
          const puan = (scores as any)[_a.id]?.[s.id]?.puan
          return puan !== undefined && puan !== null ? Number(puan) : ''
        }),
      ]
      const addedRow = ws.addRow(row)
      addedRow.height = 20
      addedRow.eachCell((cell, colNumber) => {
        cell.alignment = colNumber > 3 ? { vertical: 'middle', horizontal: 'center' } : { vertical: 'middle', horizontal: 'left' }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        }
        
        // Puan renklendirme
        if (colNumber > 3 && typeof cell.value === 'number') {
          if (cell.value < 50) {
            cell.font = { color: { argb: 'FFEF4444' }, bold: true }
          } else if (cell.value >= 85) {
            cell.font = { color: { argb: 'FF10B981' }, bold: true }
          }
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

    setReportOpen(false)
  }

  return (
    <Layout title={pageTitle} showBack backTo="/courses" showLogout={false}>
      <div className="space-y-4">
        {/* Applications Section */}
        <div ref={stickyHeaderRef} className="sticky top-14 z-30 -mx-4 px-4 py-2 -mt-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b mb-2 shadow-sm">
          <div className="flex items-center gap-2">
            {appsLoading ? (
              <div className="flex-1 flex justify-center py-2"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : applications.length === 0 ? (
              <div className="flex-1 py-4 text-center text-muted-foreground text-xs italic border border-dashed rounded-lg bg-white/50">
                Henüz uygulama eklenmedi.
              </div>
            ) : (
              <div className="flex-1 flex gap-2 overflow-x-auto pb-1">
                {applications.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => handleAppSelect(app)}
                    onContextMenu={(e) => handleAppContextMenu(e, app)}
                    className={`shrink-0 text-left px-3 py-2 rounded-lg border text-sm transition-all select-none active:scale-110 active:animate-pulse active:z-50 active:shadow-lg ${
                      selectedApp?.id === app.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-white border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium">{app.ad}</div>
                    <div className={`text-xs mt-0.5 ${selectedApp?.id === app.id ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                      {format(new Date(app.tarih + 'T12:00:00'), 'd MMM yyyy', { locale: tr })}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setAddAppOpen(true)}
              className="shrink-0 w-10 h-10 rounded-full transition-all duration-200 z-30 bg-gradient-to-b from-blue-400 to-blue-600 text-white border-t border-blue-300/50 shadow-[inset_0_-4px_6px_rgba(0,0,0,0.3),inset_0_2px_4px_rgba(255,255,255,0.3),0_6px_12px_rgba(37,99,235,0.4)] hover:from-blue-400 hover:to-blue-500 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.4),0_2px_4px_rgba(37,99,235,0.4)] active:from-blue-500 active:to-blue-600 flex items-center justify-center"
              aria-label="Uygulama Ekle"
            >
              <Plus size={24} strokeWidth={2.5} className="drop-shadow-md" />
            </button>
          </div>

          {/* Student Action Buttons (Sticky Row) */}
          <div className="flex items-center gap-2 mt-1.5 pt-2 border-t border-border/40">
             <button
               onClick={() => navigate(`/courses/${id}/seating`, { 
                 state: selectedApp ? { applicationId: selectedApp.id, applicationAd: selectedApp.ad } : undefined 
               })}
               className="flex-1 h-10 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center justify-center gap-2 text-[11px] font-bold text-blue-700 hover:bg-blue-100 transition-all active:scale-95 shadow-sm"
             >
               <LayoutGrid size={16} strokeWidth={2.5} />
               <span>PLAN</span>
             </button>
             
             <button
               onClick={() => setReportOpen(true)}
               className="flex-1 h-10 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center justify-center gap-2 text-[11px] font-bold text-blue-700 hover:bg-blue-100 transition-all active:scale-95 shadow-sm"
             >
               <FileText size={16} strokeWidth={2.5} />
               <span>RAPOR</span>
             </button>

             <button
               onClick={() => setAddStudentOpen(true)}
               className="flex-1 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center gap-2 text-[11px] font-bold shadow-md shadow-blue-200 hover:from-blue-600 hover:to-blue-700 transition-all active:scale-95"
             >
               <UserPlus size={16} strokeWidth={2.5} />
               <span>EKLE</span>
             </button>
          </div>
        </div>

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
              {students.map((student) => (
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
                  dataStudentId={student.id} // Tespiti kolaylaştırmak için id ekledik
                  onNumpadOpen={setNumpadOpenFor}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Application Dialog */}
      <Dialog open={addAppOpen} onOpenChange={setAddAppOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>Uygulama Ekle</DialogTitle></DialogHeader>
          <form onSubmit={handleAddApp} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="appAd">Uygulama Adı *</Label>
              <Input id="appAd" placeholder="1. Uygulama" value={appForm.ad}
                onChange={(e) => setAppForm({ ...appForm, ad: e.target.value })} required />
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
      <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Öğrenci Ekle</DialogTitle></DialogHeader>
          <Tabs defaultValue="tekli">
            <TabsList className="w-full">
              <TabsTrigger value="tekli" className="flex-1">Tekli Ekle</TabsTrigger>
              <TabsTrigger value="excel" className="flex-1">Excel ile Ekle</TabsTrigger>
            </TabsList>
            <TabsContent value="tekli">
              <form onSubmit={handleAddStudent} className="space-y-3 mt-2">
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
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddStudentOpen(false)}>İptal</Button>
                  <Button type="submit" disabled={studentSaving}>
                    {studentSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Ekle
                  </Button>
                </DialogFooter>
              </form>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>İptal</Button>
            <Button onClick={handleReport}>
              <Download className="mr-2 h-4 w-4" /> Excel İndir
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
  onPhotoDelete: (studentId: string) => void
  onNavigate: () => void
  dataStudentId?: string // Container'dan id'yi yakalamak için prop
  onNumpadOpen: (studentId: string) => void
}

function StudentRow({ student, selectedApp, score, scoresLoading, onScoreChange: _, onDevamsiz, onKisaNotChange, onCamera, onFileUpload, onPhotoDelete, onNavigate, dataStudentId, onNumpadOpen }: StudentRowProps) {
  const [isZoomed, setIsZoomed] = useState(false)
  const [isPhotoZoomed, setIsPhotoZoomed] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  return (
    <div data-student-id={dataStudentId} className="scroll-mt-[150px]">
      <Card className={score?.devamsiz ? 'border-destructive/40 bg-destructive/5' : ''}>
      <CardContent className="p-3">
        {/* Üst satır: avatar + isim */}
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 flex items-center justify-center shrink-0 cursor-pointer transition-all duration-300 origin-left ${isZoomed ? 'scale-[4] z-50 shadow-xl relative rounded-md overflow-hidden bg-background' : 'rounded-full overflow-hidden bg-primary/10'}`}
            onClick={(e) => {
              e.stopPropagation()
              setIsZoomed(!isZoomed)
            }}
            title={isZoomed ? "Küçült" : "Büyüt"}
          >
            {student.foto ? (
              <OfflineImage src={student.foto} alt={student.adSoyad} className="w-full h-full object-cover" />
            ) : (
              <span className={`text-primary font-semibold ${isZoomed ? 'text-[5px]' : 'text-xs'}`}>
                {student.adSoyad.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </span>
            )}
          </div>
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
              <span className="text-black font-medium">{student.no}</span> {student.pcNo && `· PC: ${student.pcNo}`}
            </div>
          </div>
        </div>

        {/* Alt satır: skorlama araçları (sadece uygulama seçiliyken) */}
        {selectedApp && (
          <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/50">
            {/* Sol: Puan + Devamsız */}
            <div className="flex items-center gap-1.5">
              <Input
                type="text"
                readOnly
                placeholder="Puan"
                value={score?.puan ?? ''}
                onClick={() => onNumpadOpen(student.id)}
                disabled={scoresLoading}
                className="w-16 h-8 text-sm text-center cursor-pointer bg-white"
              />
              <Button
                size="icon"
                variant={score?.devamsiz ? 'destructive' : 'outline'}
                className="h-8 w-8 text-xs font-bold"
                onClick={() => onDevamsiz(student.id)}
                title="Devamsız"
              >
                D
              </Button>
            </div>

            {/* Sağ: Kamera + Yükle + Kısa Not */}
            <div className="flex items-center gap-1.5">
              {score?.kameraFoto && (
                <>
                  <div
                    className="w-8 h-8 shrink-0 border border-border overflow-hidden rounded-md cursor-zoom-in"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsPhotoZoomed(true)
                    }}
                    title="Büyüt"
                  >
                    <OfflineImage src={score.kameraFoto} alt="Uygulama Fotoğrafı" className="w-full h-full object-cover" />
                  </div>
                  
                  <Dialog open={isPhotoZoomed} onOpenChange={setIsPhotoZoomed}>
                    <DialogContent className="max-w-[90vw] md:max-w-2xl bg-black/95 border-none p-0 overflow-visible shadow-2xl [&>button]:hidden">
                      <DialogTitle className="sr-only">Fotoğrafı Büyüt</DialogTitle>
                      <DialogDescription className="sr-only">Öğrencinin uygulama fotoğrafının büyük hali</DialogDescription>
                      <div className="relative w-full flex items-center justify-center min-h-[30vh]">
                        <OfflineImage 
                          src={score.kameraFoto} 
                          alt="Uygulama Fotoğrafı" 
                          className="max-w-full max-h-[50vh] object-contain rounded-md" 
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-4 -right-4 h-10 w-10 rounded-full shadow-xl z-50 border-2 border-background hover:bg-destructive hover:scale-105 transition-transform cursor-pointer"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setDeleteConfirmOpen(true)
                          }}
                          title="Fotoğrafı sil"
                        >
                          <Trash2 className="h-5 w-5 text-white" />
                        </Button>
                      </div>
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
                      setIsPhotoZoomed(false)
                      onPhotoDelete(student.id)
                    }}
                  />
                </>
              )}
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0"
                onClick={() => onCamera(student.id)}
                title={score?.kameraFoto ? "Fotoğrafı değiştir" : "Fotoğraf çek"}
              >
                <Camera className="h-3.5 w-3.5" />
              </Button>
              <label className="cursor-pointer shrink-0">
                <div className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground" title={score?.kameraFoto ? "Dosyadan değiştir" : "Dosyadan yükle"}>
                  <Upload className="h-3.5 w-3.5" />
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onFileUpload(e, student.id)}
                />
              </label>
              <Input
                placeholder="Kısa not..."
                value={score?.kisaNot ?? ''}
                onChange={(e) => onKisaNotChange(student.id, e.target.value)}
                className="h-8 text-xs w-24 min-w-0"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  )
}
