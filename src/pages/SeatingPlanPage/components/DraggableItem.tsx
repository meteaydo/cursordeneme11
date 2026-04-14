import { useDraggable } from '@dnd-kit/core'
import { createPortal } from 'react-dom'
import type { SeatObject, Score } from '@/types'
import { OfflineImage } from '@/components/ui/OfflineImage'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowUpRight, Camera, Upload, AlertCircle, X } from 'lucide-react'

interface DraggableItemProps {
  item: SeatObject
  student?: { id: string; adSoyad: string; no: string; foto?: string }
  isSelectionMode?: boolean
  isSelected?: boolean
  isFollowerDrag?: boolean
  onSelectionToggle?: () => void
  activeApplicationId?: string | null
  score?: Score
  pcSnapSide?: 'top' | 'right' | 'bottom' | 'left'
  onNumpadOpen?: (studentId: string) => void
  onDevamsizToggle?: (studentId: string) => void
  onCameraOpen?: (studentId: string) => void
  onFileUpload?: (e: React.ChangeEvent<HTMLInputElement>, studentId: string) => void
}

export function DraggableItem({
  item, student, isSelectionMode, isSelected, isFollowerDrag,
  onSelectionToggle, pcSnapSide,
  activeApplicationId, score, onNumpadOpen, onDevamsizToggle, onCameraOpen, onFileUpload
}: DraggableItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [pointerPos, setPointerPos] = useState<{x: number, y: number} | null>(null)
  const navigate = useNavigate()
  const { courseId } = useParams()
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `canvas_${item.id}`,
    data: item,
  })

  const isPcLabel = item.type === 'pc_label';

  useEffect(() => {
    if (isDragging) {
      setIsExpanded(false)
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [isDragging])

  // Parmak takip: sürükleme sırasında pc_label için pointer pozisyonunu izle
  useEffect(() => {
    if (!isDragging || !isPcLabel) {
      setPointerPos(null)
      return
    }
    const handleMove = (e: PointerEvent) => {
      setPointerPos({ x: e.clientX, y: e.clientY })
    }
    document.addEventListener('pointermove', handleMove)
    return () => document.removeEventListener('pointermove', handleMove)
  }, [isDragging, isPcLabel])

  useEffect(() => {
    if (isSelectionMode) setIsExpanded(false)
  }, [isSelectionMode])

  useEffect(() => {
    return () => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }
  }, [])

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? (isPcLabel ? 55 : 50) : (isExpanded ? 40 : (isPcLabel ? 20 : 10)),
    opacity: isDragging ? (isPcLabel ? 1 : 0.8) : 1,
  } : {
    transform: isFollowerDrag ? `translate3d(var(--drag-x, 0px), var(--drag-y, 0px), 0)` : undefined,
    zIndex: isFollowerDrag ? 49 : (isExpanded ? 40 : (isPcLabel ? 20 : 10)),
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
    if (!isExpanded && item.type === 'student' && !isSelectionMode) {
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
    
    if (!clickStartRef.current || isDragging || item.type !== 'student') return
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
  const itemHeight = isPcLabel ? 36 : 70;

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
        className={`drv-draggable touch-none select-none ${isDragging && item.type === 'student' ? 'shadow-xl shadow-primary/20' : ''}`}
      >
        <div
          {...(isExpanded ? {} : listeners)}
          {...(isExpanded ? {} : attributes)}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          className={`absolute inset-0 ${isExpanded ? 'cursor-default' : (isSelectionMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing')}`}
        >
          <SmallCard
            item={item}
            student={student}
            isExpanded={isExpanded}
            isSelectionMode={isSelectionMode}
            isSelected={isSelected}
            hasActiveApp={!!activeApplicationId}
            score={score}
            pcSnapSide={pcSnapSide}
          />
        </div>
      </div>

      {/* Büyük Kart — document.body portalı (zoom'dan bağımsız) */}
      {isExpanded && student && item.type === 'student' && createPortal(
        <ExpandedCardOverlay
          student={student}
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

      {/* Sürükleme balonu — pc_label sürüklenirken parmağın 80px üzerinde gösterilir */}
      {isDragging && isPcLabel && pointerPos && createPortal(
        <div
          className="fixed pointer-events-none z-[9999]"
          style={{
            left: pointerPos.x,
            top: pointerPos.y - 88,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="flex flex-col items-center gap-1">
            <div className="bg-primary text-white font-black text-4xl px-5 py-2.5 rounded-2xl shadow-2xl shadow-primary/60 border-2 border-white/50 animate-in zoom-in-90 duration-100">
              {item.pcNo}
            </div>
            {/* ok işaretçisi */}
            <div className="w-0 h-0" style={{
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderTop: '10px solid var(--color-primary, #6366f1)',
              opacity: 0.85
            }} />
          </div>
        </div>,
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
  pcSnapSide?: 'top' | 'right' | 'bottom' | 'left'
}

function SmallCard({ item, student, isExpanded, isSelectionMode, isSelected, hasActiveApp, score, pcSnapSide }: SmallCardProps) {
  if (item.type === 'student' && student) {
    const isDevamsiz = score?.devamsiz ?? false
    const puan = score?.puan

    return (
      <div className="inset-0 w-[70px] h-[70px] group absolute">
        <div className={`w-full h-full bg-background overflow-hidden relative shadow-sm transition-all duration-200 border border-slate-200/80 rounded-2xl ${
          isExpanded ? 'ring-2 ring-primary/60 shadow-lg scale-95' : ''
        } ${isSelected ? 'ring-4 ring-primary shadow-xl scale-95' : (pcSnapSide ? 'ring-4 ring-indigo-500/40 border-indigo-400 shadow-lg shadow-indigo-500/20' : (isSelectionMode ? 'opacity-80 scale-95' : 'hover:ring-2 hover:ring-primary/50'))}`}>
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

        {/* Kenar snap göstergeleri — pc_label sonuç yerleştirme noktaları */}
        {pcSnapSide && (
          <>
            {/* Üst kenar */}
            <div className={`absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 z-50 pointer-events-none transition-all duration-100 ${
              pcSnapSide === 'top' ? 'bg-indigo-500 border-indigo-300 scale-125 shadow-lg shadow-indigo-500/50' : 'bg-white/60 border-indigo-400/50 scale-75'
            }`} />
            {/* Sağ kenar */}
            <div className={`absolute top-1/2 -right-2 -translate-y-1/2 w-3 h-3 rounded-full border-2 z-50 pointer-events-none transition-all duration-100 ${
              pcSnapSide === 'right' ? 'bg-indigo-500 border-indigo-300 scale-125 shadow-lg shadow-indigo-500/50' : 'bg-white/60 border-indigo-400/50 scale-75'
            }`} />
            {/* Alt kenar */}
            <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 z-50 pointer-events-none transition-all duration-100 ${
              pcSnapSide === 'bottom' ? 'bg-indigo-500 border-indigo-300 scale-125 shadow-lg shadow-indigo-500/50' : 'bg-white/60 border-indigo-400/50 scale-75'
            }`} />
            {/* Sol kenar */}
            <div className={`absolute top-1/2 -left-2 -translate-y-1/2 w-3 h-3 rounded-full border-2 z-50 pointer-events-none transition-all duration-100 ${
              pcSnapSide === 'left' ? 'bg-indigo-500 border-indigo-300 scale-125 shadow-lg shadow-indigo-500/50' : 'bg-white/60 border-indigo-400/50 scale-75'
            }`} />
          </>
        )}

        {/* Puan rozeti */}
        {hasActiveApp && puan !== null && puan !== undefined && (
          <div className="absolute -top-2 -left-2 w-5 h-5 bg-primary text-white rounded-full flex items-center justify-center z-20 shadow-md">
            <span className="text-[8px] font-black">{puan}</span>
          </div>
        )}

        {/* Devamsız rozeti */}
        {isDevamsiz && (
          <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center z-20 shadow-md">
            <AlertCircle className="w-3 h-3" />
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
    const isTargeted = !!pcSnapSide;
    const isLinked = !!item.linkedStudentId;
    return (
      <div className={`w-[60px] h-[34px] backdrop-blur-sm border-2 rounded-xl flex items-center justify-center cursor-grab active:cursor-grabbing select-none transition-all duration-200 ${
        isTargeted 
          ? 'bg-blue-100 border-primary scale-110 shadow-lg shadow-primary/30 rotate-6' 
          : 'bg-white/70 border-slate-400 shadow-sm hover:bg-white/90 hover:shadow-md'
      }`}>
        <span className={`font-black text-[22px] leading-none transition-colors ${
          isTargeted ? 'text-primary' : (isLinked ? 'text-slate-700' : 'text-slate-400')
        }`}>
          {item.pcNo}
        </span>
      </div>
    )
  }

  if (item.type === 'empty_desk') {
    return (
      <div className="w-[70px] h-[70px] bg-muted/30 border-2 border-dashed border-muted-foreground/30 rounded-xl flex flex-col items-center justify-center p-2 shadow-sm">
        <span className="text-[10px] font-medium text-muted-foreground text-center">Boş<br/>Sıra</span>
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
  student: { id: string; adSoyad: string; no: string; foto?: string }
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
  student, score, hasActiveApp,
  onClose, onGoToProfile,
  onNumpadOpen, onDevamsizToggle, onCameraOpen, onFileUpload
}: ExpandedCardOverlayProps) {
  const isDevamsiz = score?.devamsiz ?? false
  const puan = score?.puan

  // Ekrana sığacak kare boyut
  const PADDING = 48
  const screenSize = Math.min(window.innerWidth, window.innerHeight - 56)
  const cardSize = Math.min(screenSize - PADDING * 2, 320)

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col items-center gap-3 animate-in zoom-in-90 fade-in duration-200"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Profil Butonu — kartın üstünde */}
        <button
          onClick={onGoToProfile}
          className="flex items-center justify-center gap-2 h-10 bg-white/90 backdrop-blur-sm text-slate-700 font-bold text-sm rounded-full shadow-lg border border-white/60 hover:bg-white active:scale-95 transition-all"
          style={{ width: cardSize }}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>Öğrenci Profili</span>
        </button>

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
        {hasActiveApp && (
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

      </div>
    </div>
  )
}
