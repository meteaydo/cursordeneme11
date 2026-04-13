import { useEffect, useState, useRef } from 'react'
import { Button } from './button'
import { OfflineImage } from './OfflineImage'

interface SmartNumpadProps {
  isOpen: boolean
  onClose: () => void
  value: string
  onChange: (val: string) => void
  student?: { adSoyad: string; no: string; foto?: string | null }
}

export function SmartNumpad({ isOpen, onClose, value, onChange, student }: SmartNumpadProps) {
  const [current, setCurrent] = useState(value)
  const [isFirstKeypress, setIsFirstKeypress] = useState(true)
  const prevIsOpen = useRef(isOpen)

  // Numpad açıldığında mevcut değeri al ve ilk tuş basımını bekle
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      setCurrent(value || '')
      setIsFirstKeypress(true)
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
      <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-all duration-300" onClick={onClose} />
      
      {/* Numpad Container */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-full duration-300">
        
        {/* Öğrenci Bilgi Alanı - Numpadin hemen üstünde yer alır */}
        {student && (
          <div className="mx-auto max-w-md p-4 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-300">
            <div className="w-24 h-24 mb-3 rounded-full overflow-hidden bg-primary/10 shadow-xl border-4 border-background flex items-center justify-center shrink-0">
              {student.foto ? (
                <OfflineImage src={student.foto} alt={student.adSoyad} className="w-full h-full object-cover" />
              ) : (
                <span className="text-primary font-semibold text-3xl">
                  {student.adSoyad.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </span>
              )}
            </div>
            <div className="text-center bg-background/80 backdrop-blur px-6 py-2 rounded-full shadow-lg border border-border/50">
              <h3 className="font-bold text-xl leading-tight">{student.adSoyad}</h3>
              <p className="text-sm font-medium text-muted-foreground">No: {student.no}</p>
            </div>
          </div>
        )}

        <div className="bg-background border-t shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] rounded-t-3xl p-5 pb-32">
          <div className="max-w-md mx-auto">
            {/* Gösterge */}
            <div className="text-center mb-6 h-12 flex items-center justify-center bg-muted/30 rounded-2xl border border-border/50">
              <span className="text-5xl font-black text-primary tracking-tighter">{current || '-'}</span>
            </div>

            <div className="grid gap-3">
              {/* Hızlı Notlar */}
              <div className="grid grid-cols-4 gap-2 mb-2">
                {['25', '50', '75', '100'].map((q) => (
                  <Button 
                    key={q} 
                    variant="secondary" 
                    className="font-bold text-lg h-14 rounded-2xl bg-secondary/60 hover:bg-secondary" 
                    onClick={() => handleQuick(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>

              {/* Rakamlar */}
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <Button 
                    key={n} 
                    variant="outline" 
                    className="text-3xl h-16 rounded-2xl font-medium border-border/50 shadow-sm" 
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
                    width="44" 
                    height="44" 
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
                  className="text-3xl h-16 rounded-2xl font-medium border-border/50 shadow-sm" 
                  onClick={() => handlePress('0')}
                >
                  0
                </Button>
                <div /> {/* Boşluk */}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
