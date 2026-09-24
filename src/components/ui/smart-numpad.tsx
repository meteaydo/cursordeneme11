import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { MoreVertical } from 'lucide-react'
import { Button } from './button'
import { OfflineImage } from './OfflineImage'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'

interface SmartNumpadProps {
  isOpen: boolean
  onClose: () => void
  value: string
  onChange: (val: string) => void
  student?: { adSoyad: string; no: string; foto?: string | null; pcNo?: string }
  profileHref?: string
  absent?: boolean
  onAbsent?: () => void
  onCamera?: () => void
  onUpload?: (file: File) => void
  note?: string
  onNoteChange?: (note: string) => void
}

export function SmartNumpad({ isOpen, onClose, value, onChange, student, profileHref, absent, onAbsent, onCamera, onUpload, note, onNoteChange }: SmartNumpadProps) {
  const [current, setCurrent] = useState(value)
  const [isFirstKeypress, setIsFirstKeypress] = useState(true)
  const [noteOpen, setNoteOpen] = useState(false)
  const [photoLarge, setPhotoLarge] = useState(false)
  const prevIsOpen = useRef(isOpen)
  const openedAt = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const hasMenu = !!(onCamera || onUpload || onNoteChange)

  const ignoreOpeningClick = () => Date.now() - openedAt.current < 400

  // Numpad açıldığında mevcut değeri al ve ilk tuş basımını bekle
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      setCurrent(value || '')
      setIsFirstKeypress(true)
      setNoteOpen(false)
      setPhotoLarge(false)
      openedAt.current = Date.now()
    }
    prevIsOpen.current = isOpen
  }, [isOpen, value])

  if (!isOpen) return null

  const handlePress = (num: string) => {
    let next = isFirstKeypress ? num : current + num
    
    // Eğer girilen değer 100'den büyükse kabul etme
    if (Number(next) > 100) return

    setCurrent(next)
    onChange(next)
    setIsFirstKeypress(false)

    // Akıllı Kapanma Mantığı
    if (next === '100') {
      setTimeout(onClose, 150)
      return
    }
    
    // 2 rakam girildiğinde ve 10 değilse kapat
    if (next.length === 2 && next !== '10') {
      setTimeout(onClose, 150)
    }
  }

  const handleQuick = (val: string) => {
    setCurrent(val)
    onChange(val)
    setTimeout(onClose, 150)
  }

  return (
    <>
      {/* Arka plan overlay'i. Tıklayınca numpad kapanır ve arka plan ciddi şekilde blurlanır */}
      <div className="fixed inset-0 z-[150] bg-background/60 backdrop-blur-sm transition-all duration-300" onClick={() => { if (!ignoreOpeningClick()) onClose() }} />
      
      {/* Numpad Container - Full screen to catch clicks outside */}
      <div 
        className="fixed inset-0 z-[150] flex flex-col justify-end animate-in fade-in duration-300"
        onClick={() => { if (!ignoreOpeningClick()) onClose() }}
      >
        <div className="w-full flex-shrink-0 animate-in slide-in-from-bottom-full duration-300">
          {/* Öğrenci Bilgi Alanı */}
          {student && (
            <div className={`mx-auto max-w-[280px] flex flex-col items-center justify-center pointer-events-none ${photoLarge ? 'px-2 pb-2 pt-16' : 'p-2'}`}>
              <div className="relative mb-1 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                {photoLarge && profileHref && (
                  <Link
                    to={profileHref}
                    className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow"
                  >
                    Öğrenci profili
                  </Link>
                )}
                <button
                  type="button"
                  aria-label="Fotoğrafı büyüt"
                  className={`${photoLarge ? 'h-36 w-36' : 'h-24 w-24'} rounded-full overflow-hidden bg-primary/10 shadow-lg border-2 border-background flex items-center justify-center shrink-0`}
                  onClick={() => setPhotoLarge(true)}
                >
                  {student.foto ? (
                    <OfflineImage src={student.foto} alt={student.adSoyad} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-primary font-semibold text-2xl">
                      {student.adSoyad.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </span>
                  )}
                </button>
              </div>
              {student.pcNo && (
                <p className="mb-1 text-3xl font-black leading-none tracking-tight text-slate-900 pointer-events-none">
                  PC {student.pcNo.replace(/^PC\s*/i, '')}
                </p>
              )}
              <div 
                className="text-center bg-background/80 backdrop-blur px-4 py-1 rounded-full shadow border border-border/50 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-bold text-base leading-tight truncate max-w-[200px]">{student.adSoyad}</h3>
                <p className="text-base font-semibold text-slate-700 leading-none">No: {student.no}</p>
              </div>
            </div>
          )}

          <div className="bg-background border-t shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] rounded-t-2xl p-3 pb-4 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            <div className="max-w-[280px] mx-auto">
              {/* Gösterge */}
              <div className="mb-3 flex items-center gap-1.5">
                <div className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border/50 bg-muted/30">
                  <span className="text-3xl font-black tracking-tighter text-primary">{current || '-'}</span>
                </div>
                {hasMenu && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" aria-label="Diğer işlemler">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="end" className="z-[600]">
                      {onCamera && (
                        <DropdownMenuItem onClick={() => { if (ignoreOpeningClick()) return; onClose(); onCamera() }}>
                          Kamera
                        </DropdownMenuItem>
                      )}
                      {onUpload && (
                        <DropdownMenuItem onClick={() => { if (!ignoreOpeningClick()) fileRef.current?.click() }}>
                          Yükle
                        </DropdownMenuItem>
                      )}
                      {onNoteChange && (
                        <DropdownMenuItem onClick={() => { if (!ignoreOpeningClick()) setNoteOpen((v) => !v) }}>
                          Kısa not{note?.trim() ? ' · dolu' : ''}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <div className="grid gap-2">
                {noteOpen && onNoteChange && (
                  <input
                    value={note ?? ''}
                    onChange={(e) => onNoteChange(e.target.value)}
                    placeholder="Kısa not..."
                    className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    autoFocus
                  />
                )}
                {onUpload && (
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) onUpload(file)
                    }}
                  />
                )}
                {/* Hızlı Notlar */}
                <div className="grid grid-cols-4 gap-1.5 mb-1">
                  {['25', '50', '75', '100'].map((q) => (
                    <Button 
                      key={q} 
                      variant="secondary" 
                      className="font-bold text-sm h-10 rounded-xl bg-secondary/60 hover:bg-secondary px-0" 
                      onClick={() => handleQuick(q)}
                    >
                      {q}
                    </Button>
                  ))}
                </div>

                {/* Rakamlar */}
                <div className="grid grid-cols-3 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <Button 
                      key={n} 
                      variant="outline" 
                      className="text-xl h-12 rounded-xl font-medium border-border/50 shadow-sm" 
                      onClick={() => handlePress(n.toString())}
                    >
                      {n}
                    </Button>
                  ))}
                  <div 
                    className="flex items-center justify-center cursor-pointer opacity-50 hover:opacity-100 hover:text-red-500 transition-all active:scale-90"
                    onClick={() => {
                      setCurrent('')
                      onChange('')
                      setTimeout(onClose, 150)
                    }}
                    title="Puanı Sil"
                  >
                    <svg 
                      width="32" 
                      height="32" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="1.5" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                    >
                      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                      <path d="m22 21H7" />
                      <path d="m5 11 9 9" />
                    </svg>
                  </div>
                  <Button 
                    variant="outline" 
                    className="text-xl h-12 rounded-xl font-medium border-border/50 shadow-sm" 
                    onClick={() => handlePress('0')}
                  >
                    0
                  </Button>
                  {onAbsent ? (
                    <Button
                      type="button"
                      variant={absent ? 'default' : 'outline'}
                      className={`h-12 rounded-xl text-xl font-bold ${absent ? 'bg-red-500 text-white hover:bg-red-600' : 'border-border/50'}`}
                      onClick={() => {
                        if (ignoreOpeningClick()) return
                        onAbsent()
                        setTimeout(onClose, 150)
                      }}
                    >
                      D
                    </Button>
                  ) : (
                    <div />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
