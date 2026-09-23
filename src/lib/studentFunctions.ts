import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'

export type SetStudentPinResult = { pin: string; created: boolean }
export type GetStudentPinResult = { pin: string | null; hasPin: boolean }

export async function callSetStudentPin(params: {
  courseId: string
  studentId: string
  pin?: string
  renew?: boolean
}): Promise<SetStudentPinResult> {
  const fn = httpsCallable<typeof params, SetStudentPinResult>(functions, 'setStudentPin')
  const res = await fn(params)
  return res.data
}

export async function callGetStudentPin(params: {
  courseId: string
  studentId: string
}): Promise<GetStudentPinResult> {
  const fn = httpsCallable<typeof params, GetStudentPinResult>(functions, 'getStudentPin')
  const res = await fn(params)
  return res.data
}

export async function callStudentLogin(params: { no: string; pin: string }): Promise<{ token: string }> {
  const fn = httpsCallable<{ no: string; pin: string }, { token: string }>(functions, 'studentLogin')
  const res = await fn(params)
  return res.data
}

export function callableErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code)
    if (code.includes('not-found') || code.includes('functions/not-found')) {
      return 'Öğrenci girişi henüz sunucuda açık değil. firebase deploy --only functions'
    }
    if (code.includes('invalid-argument') && String((err as { message?: unknown }).message || '').toLowerCase().includes('pin')) {
      return 'Numara veya PIN hatalı.'
    }
    if (code.includes('unauthenticated')) return 'Numara veya PIN hatalı.'
    if (code.includes('resource-exhausted')) return 'Çok fazla deneme. Biraz sonra tekrar deneyin.'
    if (code.includes('already-exists')) return 'Bu öğrenci numarası başka bir kayıtta kullanılıyor.'
    if (code.includes('failed-precondition')) return 'Önce öğrenci numarasını kaydedin.'
    if ('message' in err) return String((err as { message: unknown }).message)
  }
  return err instanceof Error ? err.message : 'İşlem başarısız.'
}
