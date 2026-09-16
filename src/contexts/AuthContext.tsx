import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '@/lib/firebase'

function firebaseErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code)
    const message = 'message' in err ? String((err as { message: unknown }).message) : ''
    return `${code}${message ? `: ${message}` : ''}`
  }
  return err instanceof Error ? err.message : 'Google ile giriş başarısız.'
}

async function saveUserToFirestore(u: User) {
  await setDoc(
    doc(db, 'users', u.uid),
    { email: u.email, displayName: u.displayName, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) return saveUserToFirestore(result.user)
      })
      .catch((err) => {
        console.error('Google redirect sonucu:', firebaseErrorMessage(err))
      })

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signUp = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })
    await saveUserToFirestore({ ...cred.user, displayName })
  }

  const signInWithGoogle = async () => {
    try {
      await signInWithRedirect(auth, googleProvider)
    } catch (err) {
      console.error('Google redirect başarısız:', firebaseErrorMessage(err))
      try {
        const cred = await signInWithPopup(auth, googleProvider)
        await saveUserToFirestore(cred.user)
      } catch (popupErr) {
        console.error('Google popup başarısız:', firebaseErrorMessage(popupErr))
        throw popupErr
      }
    }
  }

  const logout = async () => {
    await signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
