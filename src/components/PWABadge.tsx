import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

function PWABadge() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      if (r) {
        // Check for updates every hour
        setInterval(() => {
          r.update()
        }, 60 * 60 * 1000)
      }
    },
    onRegisterError(error: any) {
      console.error('SW registration error', error)
    },
  })

  // Also check for updates when window gets focus
  useEffect(() => {
    const checkUpdate = async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) {
          registration.update()
        }
      }
    }

    window.addEventListener('focus', checkUpdate)
    return () => window.removeEventListener('focus', checkUpdate)
  }, [])

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  if (!offlineReady && !needRefresh) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-indigo-100 dark:border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-sm"
      role="alert"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
            <svg
              className="w-6 h-6 text-indigo-600 dark:text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {needRefresh ? 'Yeni Sürüm Hazır!' : 'Çevrimdışı Kullanılabilir'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {needRefresh 
                ? 'Yeni özellikleri kullanmak için uygulamayı yenileyin.' 
                : 'Uygulama artık internet olmadan da çalışabilir.'}
            </p>
          </div>
          <button
            onClick={() => close()}
            className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {needRefresh && (
          <button
            onClick={() => updateServiceWorker(true)}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
          >
            Şimdi Yenile
          </button>
        )}
      </div>
    </div>
  )
}

export default PWABadge
