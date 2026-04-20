import { useDraggable } from '@dnd-kit/core'
import { createPortal } from 'react-dom'
import type { SeatObject, Score } from '@/types'
import { OfflineImage } from '@/components/ui/OfflineImage'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowUpRight, Camera, Upload, X, Check, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import { formatClassName } from '@/lib/utils'

interface DraggableItemProps {
  item: SeatObject
  student?: { id: string; adSoyad: string; no: string; foto?: string; pcNo?: string; eskiPcNolari?: string[] }
  studentsList?: any[]
  updateStudentData?: (id: string, data: any) => Promise<void>
  isSelectionMode?: boolean
  isSelected?: boolean
  isFollowerDrag?: boolean
  onSelectionToggle?: () => void
  activeApplicationId?: string | null
  score?: Score
  onNumpadOpen?: (studentId: string) => void
  onDevamsizToggle?: (studentId: string) => void
  onCameraOpen?: (studentId: string) => void
  onFileUpload?: (e: React.ChangeEvent<HTMLInputElement>, studentId: string) => void
  onRemove?: (id: string) => void
}

export function DraggableItem({
  item, student, studentsList, updateStudentData, isSelectionMode, isSelected, isFollowerDrag,
  onSelectionToggle, onRemove,
  activeApplicationId, score, onNumpadOpen, onDevamsizToggle, onCameraOpen, onFileUpload
}: DraggableItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const navigate = useNavigate()
  const { courseId } = useParams()
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)

  const isPcLabel = item.type === 'pc_label';
  const isStudent = item.type === 'student' || item.type === 'empty_desk';
  const baseZIndex = isPcLabel ? 10 : (isStudent ? 20 : 5);

  // pc_label tipi artık sürüklenemiyor — useDraggable disabled ile çağrılıyor
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `canvas_${item.id}`,
    data: item,
    disabled: isPcLabel,
  })

  useEffect(() => {
    if (isDragging) {
      setIsExpanded(false)
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [isDragging])

  useEffect(() => {
    if (isSelectionMode) setIsExpanded(false)
  }, [isSelectionMode])

  useEffect(() => {
    return () => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }
  }, [])

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 50 : (isExpanded ? 40 : baseZIndex),
    opacity: isDragging ? 0.8 : 1,
  } : {
    transform: isFollowerDrag ? `translate3d(var(--drag-x, 0px), var(--drag-y, 0px), 0)` : undefined,
    zIndex: isFollowerDrag ? 49 : (isExpanded ? 40 : baseZIndex),
    opacity: isFollowerDrag ? 0.9 : 1,
  }

  const clickStartRef = React.useRef<{x: number, y: number, time: number} | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    // Çoklu dokunuş varsa (zoom ihtimali) hiçbir işlemi başlatma
    if (e.pointerType === 'touch' && (e.nativeEvent as any).touches?.length > 1) {
      return
    }
    clickStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() }
    
    // 1.5 saniye basılı tutma timer'ını başlat (Seçim moduna girmek için)
    if (!isExpanded && (item.type === 'student' || item.type === 'empty_desk') && !isSelectionMode) {
      longPressTimer.current = setTimeout(() => {
        if (onSelectionToggle) {
          onSelectionToggle()
          // Haptic Feedback (Sadece gerçekten aktifse ve destekleniyorsa)
          try {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              // @ts-ignore - navigator.userActivation modern tarayıcılarda vardır
              if (!navigator.userActivation || navigator.userActivation.isActive) {
                navigator.vibrate(50);
              }
            }
          } catch (e) { /* ignore */ }
        }
      }, 1500)
    }

    if (!isExpanded && listeners?.onPointerDown) {
      listeners.onPointerDown(e as any)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    
    if (!clickStartRef.current || isDragging || (item.type !== 'student' && item.type !== 'empty_desk')) return
    const dx = Math.abs(e.clientX - clickStartRef.current.x)
    const dy = Math.abs(e.clientY - clickStartRef.current.y)
    const dt = Date.now() - clickStartRef.current.time
    
    // Eğer 1.5 saniyeyi doldurmadan bıraktıysa ve hareket etmediyse tıklama işlemi
    if (dx < 10 && dy < 10 && dt < 1500) {
      if (dt < 450) { // Kısa tıklama
        e.stopPropagation()
        if (isSelectionMode) {
          if (onSelectionToggle) onSelectionToggle()
        } else {
          setTimeout(() => {
            setIsExpanded(p => !p)
          }, 10)
        }
      }
    }
    clickStartRef.current = null
  }

  const handleGoToProfile = useCallback(() => {
    if (student && courseId) {
      setIsExpanded(false)
      navigate(`/courses/${courseId}/students/${student.id}`)
    }
  }, [student, courseId, navigate])

  // pc_label için özel boyut
  const itemWidth = isPcLabel ? 64 : 70;
  const itemHeight = isPcLabel ? 24 : 70;

  return (
    <>
      {/* Küçük Kart — canvas içinde */}
      <div
        ref={setNodeRef}
        style={{
          position: 'absolute',
          top: item.y,
          left: item.x,
          width: itemWidth,
          height: itemHeight,
          ...style
        }}
        className={`drv-draggable touch-none select-none ${isDragging && (item.type === 'student' || item.type === 'empty_desk') ? 'shadow-xl shadow-primary/20' : ''}`}
      >
        <div
          {...(isExpanded || isPcLabel ? {} : listeners)}
          {...(isExpanded || isPcLabel ? {} : attributes)}
          onPointerDown={isPcLabel ? undefined : handlePointerDown}
          onPointerUp={isPcLabel ? undefined : handlePointerUp}
          className={`absolute inset-0 ${isExpanded || isPcLabel ? 'cursor-default' : (isSelectionMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing')}`}
        >
          <SmallCard
            item={item}
            student={student}
            isExpanded={isExpanded}
            isSelectionMode={isSelectionMode}
            isSelected={isSelected}
            hasActiveApp={!!activeApplicationId}
            score={score}
            onRemove={onRemove}
          />
        </div>
      </div>

      {/* Büyük Kart — document.body portalı (zoom'dan bağımsız) */}
      {isExpanded && student && (item.type === 'student' || item.type === 'empty_desk') && createPortal(
        <ExpandedCardOverlay
          student={student}
          studentsList={studentsList || []}
          updateStudentData={updateStudentData || (async () => {})}
          score={score}
          hasActiveApp={!!activeApplicationId}
          onClose={() => setIsExpanded(false)}
          onGoToProfile={handleGoToProfile}
          onNumpadOpen={onNumpadOpen}
          onDevamsizToggle={onDevamsizToggle}
          onCameraOpen={onCameraOpen}
          onFileUpload={onFileUpload}
        />,
        document.body
      )}
    </>
  )
}

// ─── Küçük kart (canvas içinde, 70×70) ───────────────────────────────────────

interface SmallCardProps {
  item: SeatObject
  student?: { id: string; adSoyad: string; no: string; foto?: string }
  isExpanded: boolean
  isSelectionMode?: boolean
  isSelected?: boolean
  hasActiveApp: boolean
  score?: Score
  onRemove?: (id: string) => void
}

function SmallCard({ item, student, isExpanded, isSelectionMode, isSelected, hasActiveApp, score, onRemove }: SmallCardProps) {
  if (item.type === 'student' && student) {
    const isDevamsiz = score?.devamsiz ?? false
    const puan = score?.puan

    return (
      <div className="inset-0 w-[70px] h-[70px] group absolute">
        <div className={`w-full h-full bg-background overflow-hidden relative shadow-sm transition-all duration-200 border border-slate-200/80 rounded-2xl ${
          isExpanded ? 'ring-2 ring-primary/60 shadow-lg scale-95' : ''
        } ${isSelected ? 'ring-4 ring-primary shadow-xl scale-95' : (isSelectionMode ? 'opacity-80 scale-95' : 'hover:ring-2 hover:ring-primary/50')}`}>
          {student.foto ? (
            <OfflineImage src={student.foto} alt={student.adSoyad} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
          ) : (
            <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
              <span className="text-slate-400 font-extrabold text-2xl tracking-tighter group-hover:scale-110 transition-transform duration-300">
                {student.adSoyad.toLocaleUpperCase('tr-TR').split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
              </span>
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-white/85 backdrop-blur-md px-1 border-t border-white/40 flex items-center justify-center pt-0.5 pb-1">
            <span className="block font-bold text-[9px] leading-[1.1] text-center text-slate-800 w-full truncate" title={student.adSoyad}>
              {student.adSoyad.toLocaleUpperCase('tr-TR')}
            </span>
          </div>
        </div>

        {/* Öğrenci Numarası (Dikey - Sağ kenar) */}
        <div className="absolute top-4 -right-2 pointer-events-none z-30 select-none">
          <span className="text-[9px] font-bold text-slate-800 block transform -rotate-90 origin-center whitespace-nowrap">
            {student.no}
          </span>
        </div>

        {/* Puan rozeti */}
        {hasActiveApp && puan !== null && puan !== undefined && (
          <div className="absolute -top-2 -left-2 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center z-20 shadow-md opacity-50">
            <span className="text-[10px] font-black">{puan}</span>
          </div>
        )}

        {/* Devamsız rozeti */}
        {isDevamsiz && (
          <div className="absolute -top-2 -left-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center z-20 shadow-md opacity-50">
            <span className="text-[10px] font-black">D</span>
          </div>
        )}

        {/* Seçim checkmark */}
        {isSelectionMode && (
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full shadow-md border-2 border-slate-100 flex items-center justify-center z-50">
            {isSelected && <div className="w-3 h-3 bg-primary rounded-full animate-in zoom-in" />}
          </div>
        )}
      </div>
    )
  }

  if (item.type === 'pc_label') {
    const isLinked = !!item.linkedStudentId;
    return (
      <div 
        style={{ transform: 'rotate(45deg)' }}
        className={`w-[60px] h-[24px] backdrop-blur-sm border-2 rounded-xl flex items-center justify-start pl-1.5 select-none transition-all duration-200 ${
        isLinked
          ? 'bg-white/70 border-slate-400/15 shadow-sm'
          : 'bg-white/40 border-slate-300/20 shadow-sm'
      }`}>
        <span className={`font-black text-[22px] leading-none ${isLinked ? 'text-slate-700' : 'text-slate-400'}`}>
          {item.pcNo}
        </span>
      </div>
    )
  }

  if (item.type === 'empty_desk') {
    return (
      <div className={`w-[70px] h-[70px] bg-muted/10 border-2 border-dashed border-muted-foreground/30 rounded-xl flex flex-col items-center justify-center p-2 relative transition-all duration-200 ${
        isExpanded ? 'ring-2 ring-primary/60 shadow-lg scale-95' : 'shadow-sm'
      } ${isSelected ? 'ring-4 ring-primary shadow-xl scale-95 border-solid' : (isSelectionMode ? 'opacity-80 scale-95' : 'hover:border-primary/50 hover:bg-muted/30')}`}>
        <span className="text-[10px] font-medium text-muted-foreground text-center">Boş<br/>Sıra</span>
        
        {/* Silme Butonu */}
        {!isSelectionMode && onRemove && (
          <button 
             onPointerDown={(e) => e.stopPropagation()} 
             onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
             className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full shadow-md border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors z-50"
             title="Sırayı Sil"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        {isSelectionMode && (
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full shadow-md border-2 border-slate-100 flex items-center justify-center z-50">
            {isSelected && <div className="w-3 h-3 bg-primary rounded-full animate-in zoom-in" />}
          </div>
        )}
      </div>
    )
  }
  if (item.type === 'empty_object') {
    return (
      <div className="w-[60px] h-[60px] bg-accent/50 border border-accent rounded-full flex flex-col items-center justify-center p-2 shadow-sm">
        <span className="text-[9px] font-medium text-accent-foreground text-center">Obje</span>
      </div>
    )
  }
  if (item.type === 'tahta') {
    return (
      <div className="w-[200px] h-[40px] bg-white border-2 border-border rounded-xl flex items-center justify-center shadow-md">
        <span className="text-xs font-bold text-foreground tracking-widest">TAHTA</span>
      </div>
    )
  }
  if (item.type === 'masa') {
    return (
      <div className="w-[120px] h-[60px] bg-white border-2 border-border rounded-xl flex items-center justify-center shadow-md">
        <span className="text-xs font-bold text-foreground tracking-widest">MASA</span>
      </div>
    )
  }
  return null
}

// ─── Büyük kart overlay (document.body portalı, zoom'dan tamamen bağımsız) ───

interface ExpandedCardOverlayProps {
  student: { id: string; adSoyad: string; no: string; foto?: string; pcNo?: string; eskiPcNolari?: string[] }
  studentsList: any[]
  updateStudentData: (id: string, data: any) => Promise<void>
  score?: Score
  hasActiveApp: boolean
  onClose: () => void
  onGoToProfile: () => void
  onNumpadOpen?: (studentId: string) => void
  onDevamsizToggle?: (studentId: string) => void
  onCameraOpen?: (studentId: string) => void
  onFileUpload?: (e: React.ChangeEvent<HTMLInputElement>, studentId: string) => void
}

function ExpandedCardOverlay({
  student, studentsList: students, updateStudentData: updateStudent, score, hasActiveApp,
  onClose, onGoToProfile,
  onNumpadOpen, onDevamsizToggle, onCameraOpen, onFileUpload
}: ExpandedCardOverlayProps) {
  const isDevamsiz = score?.devamsiz ?? false
  const puan = score?.puan

  const LONG_PRESS_MS = 200
  const MOVE_THRESHOLD = 5

  const [formPcNo, setFormPcNo] = useState(student.pcNo || '')
  const [formEski, setFormEski] = useState<string[]>(student.eskiPcNolari || [])
  const [localPcNo, setLocalPcNo] = useState(student.pcNo || '')

  useEffect(() => {
    if (student) {
      // Sadece form güncellendiğinde, ancak local input formla uyumluysa güncellesin
      // Bu sayede kullanıcı yazarken arkaplan senkronizasyonu yazdığını aniden silmez
      setFormPcNo(student.pcNo || '')
      setFormEski(student.eskiPcNolari || [])
      setLocalPcNo(prev => {
        if (prev === formPcNo) return student.pcNo || '';
        return prev; // Kullanıcı şu an yazıyor, ellemeyelim
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.pcNo, student.eskiPcNolari])

  const [pcConflictConfirm, setPcConflictConfirm] = useState<{ newPcNo: string, conflictStudent: any } | null>(null)
  
  const [pcDragReady, setPcDragReady] = useState(false)
  const [pcDragging, setPcDragging] = useState(false)
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 })
  const [isDragOver, setIsDragOver] = useState(false)
  
  const pcInputRef = useRef<HTMLInputElement>(null)
  const pcWrapRef = useRef<HTMLDivElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPos = useRef({ x: 0, y: 0 })
  const pIdRef = useRef<number | null>(null)

  const updateCardStudent = (newPcNo: string, newEski: string[]) => {
    setFormPcNo(newPcNo)
    setFormEski(newEski)
    updateStudent(student.id, { pcNo: newPcNo, eskiPcNolari: newEski })
  }

  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  const handlePcPointerDown = (e: React.PointerEvent) => {
    if (!formPcNo) return
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
    if (pcDragReady && isDragOver && formPcNo) {
      updateCardStudent('', [formPcNo, ...formEski.filter((p) => p !== formPcNo)])
      setLocalPcNo('')
    }
    setPcDragReady(false)
    setPcDragging(false)
    setIsDragOver(false)
  }

  const handlePcNoBlurOrEnter = (val: string): boolean => {
    const newPcNo = formatClassName(val);
    setLocalPcNo(newPcNo);
    
    if (newPcNo === formPcNo) return false;
    
    if (newPcNo) {
      const conflict = students.find(s => s.pcNo === newPcNo && s.id !== student.id);
      if (conflict) {
        setPcConflictConfirm({ newPcNo, conflictStudent: conflict });
        return true;
      }
    }
    updateCardStudent(newPcNo, formEski);
    return false;
  };

  const handleClose = () => {
    if (localPcNo !== formPcNo) {
      const hasConflict = handlePcNoBlurOrEnter(localPcNo);
      if (hasConflict) return; // Çakışma modalı açılıyorsa kapatmayı iptal et
    }
    onClose();
  }

  const removeOldPc = (idx: number) => {
    const nextArr = formEski.filter((_, i) => i !== idx);
    updateCardStudent(formPcNo, nextArr);
  }

  // Ekrana sığacak kare boyut
  const PADDING = 48
  const screenSize = Math.min(window.innerWidth, window.innerHeight - 56)
  const cardSize = Math.min(screenSize - PADDING * 2, 320)

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className="flex flex-col items-center gap-3 animate-in zoom-in-90 fade-in duration-200"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Profil Butonu — kartın üstünde */}
        {student.adSoyad !== 'Boş Sıra' && (
          <button
            onClick={onGoToProfile}
            className="flex items-center justify-center gap-2 h-10 bg-white/90 backdrop-blur-sm text-slate-700 font-bold text-sm rounded-full shadow-lg border border-white/60 hover:bg-white active:scale-95 transition-all"
            style={{ width: cardSize }}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Öğrenci Profili</span>
          </button>
        )}

        {/* Kart */}
        <div
          className="relative bg-background rounded-[32px] overflow-hidden shadow-2xl border-[3px] border-primary/30"
          style={{ width: cardSize, height: cardSize }}
        >
          {student.foto ? (
            <OfflineImage src={student.foto} alt={student.adSoyad} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
              <span className="text-slate-400 font-extrabold tracking-tighter" style={{ fontSize: cardSize * 0.30 }}>
                {student.adSoyad.toLocaleUpperCase('tr-TR').split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
              </span>
            </div>
          )}

          {/* Ad Soyad şeridi */}
          <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md pt-2 pb-3 px-3 border-t border-white/40">
            <span className="block font-bold text-[15px] leading-tight text-center text-slate-800 truncate">
              {student.adSoyad.toLocaleUpperCase('tr-TR')}
            </span>
          </div>

          {/* Devamsız badge */}
          {isDevamsiz && (
            <div className="absolute top-3 right-3 bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded-full shadow">
              DEVAMSIZ
            </div>
          )}

          {/* Kapat butonu */}
          <button
            onClick={onClose}
            className="absolute top-3 left-3 w-8 h-8 bg-black/30 backdrop-blur-sm text-white rounded-full flex items-center justify-center hover:bg-black/50 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Puanlama Paneli */}
        {hasActiveApp && student.adSoyad !== 'Boş Sıra' && (
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden" style={{ width: cardSize }}>
            {/* Puan + Devamsız */}
            <div className="flex items-stretch">
              <button
                onClick={() => { onClose(); onNumpadOpen?.(student.id) }}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-4 border-r border-slate-100 transition-all active:scale-95 ${
                  puan !== null && puan !== undefined ? 'bg-primary/5' : 'hover:bg-slate-50'
                }`}
              >
                <span className={`font-black text-5xl leading-none ${puan !== null && puan !== undefined ? 'text-primary' : 'text-slate-300'}`}>
                  {puan !== null && puan !== undefined ? puan : 'Puan'}
                </span>
              </button>

              <button
                onClick={() => { onClose(); onDevamsizToggle?.(student.id) }}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-4 transition-all active:scale-95 ${isDevamsiz ? 'bg-red-50' : 'hover:bg-slate-50'}`}
              >
                <span className={`font-black text-4xl leading-none ${isDevamsiz ? 'text-red-500' : 'text-slate-300'}`}>D</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDevamsiz ? 'text-red-400' : 'text-slate-400'}`}>
                  Devamsız
                </span>
              </button>
            </div>

            {/* Kamera + Dosya */}
            <div className="flex items-stretch border-t border-slate-100">
              <button
                onClick={() => { onClose(); setTimeout(() => onCameraOpen?.(student.id), 150) }}
                className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3.5 border-r border-slate-100 hover:bg-slate-50 transition-all active:scale-95"
              >
                <Camera className="w-5 h-5 text-slate-500" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kamera</span>
              </button>

              <label className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3.5 hover:bg-slate-50 transition-all active:scale-95 cursor-pointer border-r border-slate-100">
                <Upload className="w-5 h-5 text-slate-500" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Yükle</span>
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={(e) => { onClose(); onFileUpload?.(e, student.id) }}
                />
              </label>

              {/* Kanıt fotoğraf önizleme */}
              {score?.kameraFoto ? (
                <div className="w-20 shrink-0 p-2">
                  <OfflineImage src={score.kameraFoto} alt="Kanıt" className="w-full h-full object-cover rounded-xl" />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3.5 opacity-30">
                  <div className="w-5 h-5 rounded border-2 border-slate-400 border-dashed" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kanıt</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Form - PC Yönetimi */}
        <Card className="border-blue-400/80 border-2 bg-blue-50/10 shadow-md w-full" style={{ maxWidth: cardSize }}>
          <CardContent className="p-3 space-y-2">
            <style>{`
              @keyframes pc-wiggle {
                0%, 100% { transform: scale(1.12) rotate(0deg); }
                20% { transform: scale(1.12) rotate(-3deg); }
                40% { transform: scale(1.12) rotate(3deg); }
                60% { transform: scale(1.12) rotate(-2deg); }
                80% { transform: scale(1.12) rotate(2deg); }
              }
            `}</style>
            <div className="grid grid-cols-[1fr_2fr] gap-2 items-start">
              <div className="space-y-1">
                <Label className="text-xs">PC No</Label>
                <div
                  ref={pcWrapRef}
                  onPointerDown={handlePcPointerDown}
                  onPointerMove={handlePcPointerMove}
                  onPointerUp={handlePcPointerUp}
                  onPointerCancel={handlePcPointerUp}
                  style={pcDragReady && !pcDragging ? { animation: 'pc-wiggle 0.4s ease-in-out infinite' } : undefined}
                  className={`relative flex items-center touch-none transition-shadow rounded-md ${pcDragReady ? 'shadow-lg ring-2 ring-primary' : ''}`}
                >
                  <Input
                    ref={pcInputRef}
                    value={localPcNo}
                    onChange={(e) => setLocalPcNo(e.target.value)}
                    onBlur={(e) => handlePcNoBlurOrEnter(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handlePcNoBlurOrEnter(e.currentTarget.value)
                        pcInputRef.current?.blur()
                      }
                    }}
                    className={`h-8 font-bold px-1.5 text-center ${pcDragReady ? 'pointer-events-none' : ''}`}
                  />
                  {localPcNo !== formPcNo && !pcDragReady && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const hasConflict = handlePcNoBlurOrEnter(localPcNo);
                        if (!hasConflict) onClose();
                      }}
                      className="absolute right-1 w-6 h-6 flex items-center justify-center bg-green-500 rounded-md text-white shadow-sm hover:bg-green-600 active:scale-95 transition-all z-10 animate-in zoom-in-50 duration-200"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs pl-1">Eski PC Noları</Label>
                <div
                  ref={dropZoneRef}
                  className={`min-h-[32px] rounded-md border-2 border-dashed px-1.5 py-1 transition-all flex flex-wrap gap-1 items-center justify-center ${isDragOver
                    ? 'border-primary bg-primary/10 scale-[1.02]'
                    : pcDragReady
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-secondary/30'
                    }`}
                >
                  {formEski.length === 0 && !pcDragReady && (
                    <span className="text-[9px] text-muted-foreground w-full text-center">PC No → buraya sürükle</span>
                  )}
                  {formEski.length === 0 && pcDragReady && !isDragOver && (
                    <span className="text-[10px] font-bold text-primary animate-pulse w-full text-center">Buraya bırak!</span>
                  )}
                  {formEski.map((pc, i) => (
                    <span key={i} className="inline-flex items-center gap-0.5 bg-background border border-border px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shadow-sm">
                      {pc}
                      <button onClick={() => removeOldPc(i)} className="hover:text-destructive shrink-0">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {pcDragging && formPcNo && (
        <div
          className="fixed z-[300] pointer-events-none bg-primary text-white px-3 py-1 rounded-full text-sm font-medium shadow-lg"
          style={{ left: ghostPos.x, top: ghostPos.y, transform: 'translate(-50%, -120%)' }}
        >
          {formPcNo}
        </div>
      )}

      <ConfirmDialog
        open={!!pcConflictConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setPcConflictConfirm(null);
            setLocalPcNo(formPcNo); // Revert
          }
        }}
        title="PC Numarası Çakışması"
        description={`${pcConflictConfirm?.newPcNo} bilgisayarı şu anda "${pcConflictConfirm?.conflictStudent.adSoyad}" isimli öğrenciye atanmış durumda. Bu bilgisayarı devretmek istiyor musunuz?`}
        confirmText="Evet, Devret"
        cancelText="İptal"
        onConfirm={() => {
          if (pcConflictConfirm) {
            updateStudent(pcConflictConfirm.conflictStudent.id, { pcNo: '' });
            updateCardStudent(pcConflictConfirm.newPcNo, formEski);
            setLocalPcNo(pcConflictConfirm.newPcNo);
            setPcConflictConfirm(null);
            toast({
              title: "PC Aktarıldı",
              description: `${pcConflictConfirm.conflictStudent.adSoyad} isimli öğrencinin PC numarası boşaltıldı.`,
              variant: "blue"
            });
            onClose();
          }
        }}
      />
    </div>
  )
}
