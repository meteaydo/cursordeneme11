import { useMemo, useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { Loader2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'

function passwordErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code)
    if (code.includes('wrong-password') || code.includes('invalid-credential')) {
      return 'Mevcut parola hatalı.'
    }
    if (code.includes('weak-password')) return 'Yeni parola en az 6 karakter olmalı.'
    if (code.includes('requires-recent-login')) return 'Güvenlik için çıkış yapıp tekrar giriş yapın.'
  }
  return err instanceof Error ? err.message : 'Parola güncellenemedi.'
}

export default function ProfilePage() {
  const { user } = useAuth()
  const canChangePassword = useMemo(
    () => user?.providerData.some((p) => p.providerId === 'password') ?? false,
    [user],
  )

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.email) {
      toast({ title: 'Parola değiştirilemedi', description: 'E-posta bulunamadı.', variant: 'destructive' })
      return
    }
    if (newPassword.length < 6) {
      toast({ title: 'Parola çok kısa', description: 'En az 6 karakter girin.', variant: 'destructive' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Parolalar uyuşmuyor', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast({ title: 'Parola güncellendi' })
    } catch (err) {
      toast({
        title: 'Parola güncellenemedi',
        description: passwordErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout title="Profil">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Hesap</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Label className="text-muted-foreground">E-posta</Label>
          <p className="text-sm font-medium break-all">{user?.email ?? '—'}</p>
        </CardContent>
      </Card>

      {canChangePassword ? (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Parola değiştir</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Mevcut parola</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Yeni parola</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Yeni parola (tekrar)</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Parolayı güncelle
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Google ile giriş yaptığınız için parola buradan değiştirilemez.
        </p>
      )}
    </Layout>
  )
}
