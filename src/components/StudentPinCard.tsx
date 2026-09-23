import { useEffect, useState } from 'react'
import { Copy, KeyRound, Loader2, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { callGetStudentPin, callSetStudentPin, callableErrorMessage } from '@/lib/studentFunctions'
import { toast } from '@/hooks/use-toast'

type StudentPinCardProps = {
  courseId: string
  studentId: string
  ogrenciNo: string
}

export function StudentPinCard({ courseId, studentId, ogrenciNo }: StudentPinCardProps) {
  const [pin, setPin] = useState<string | null>(null)
  const [hasPin, setHasPin] = useState(false)
  const [customPin, setCustomPin] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    callGetStudentPin({ courseId, studentId })
      .then((res) => {
        if (cancelled) return
        setPin(res.pin)
        setHasPin(res.hasPin)
      })
      .catch((err) => {
        if (!cancelled) {
          setPin(null)
          setHasPin(false)
          console.error(err)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [courseId, studentId])

  const savePin = async (opts: { renew?: boolean; pin?: string }) => {
    if (!ogrenciNo.trim()) {
      toast({ title: 'Önce öğrenci numarasını kaydedin', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await callSetStudentPin({
        courseId,
        studentId,
        renew: opts.renew,
        pin: opts.pin,
      })
      setPin(res.pin)
      setHasPin(true)
      setCustomPin('')
      toast({ title: opts.renew ? 'PIN yenilendi' : 'PIN hazır', description: `PIN: ${res.pin}` })
    } catch (err) {
      toast({ title: 'PIN kaydedilemedi', description: callableErrorMessage(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const copyPin = async () => {
    if (!pin) return
    try {
      await navigator.clipboard.writeText(pin)
      toast({ title: 'PIN kopyalandı' })
    } catch {
      toast({ title: 'Kopyalanamadı', variant: 'destructive' })
    }
  }

  return (
    <Card className="border-emerald-400/80 border-2 bg-emerald-50/10 shadow-md">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-emerald-700" />
          <Label className="text-sm font-semibold">Öğrenci paneli PIN</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Öğrenci okul nosu ve bu PIN ile giriş yapar. Aynı no diğer derslerde de bu PIN’i kullanır.
        </p>
        {loading ? (
          <div className="flex justify-center py-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Input readOnly value={pin ?? (hasPin ? '••••••' : 'PIN yok')} className="h-9 font-mono tracking-widest" />
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={copyPin} disabled={!pin}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                inputMode="numeric"
                placeholder="İstersen 4–8 hane yaz"
                value={customPin}
                onChange={(e) => setCustomPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className="h-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1"
                disabled={saving}
                onClick={() => savePin({ pin: customPin || undefined, renew: hasPin && !!customPin })}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {hasPin && !customPin ? 'Bu derse bağla' : hasPin ? 'PIN’i değiştir' : 'PIN oluştur'}
              </Button>
              {hasPin && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => savePin({ renew: true })}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Yenile
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
