import React, { useState, useEffect } from 'react'
import { getLocalImageUrl } from '@/lib/imageQueue'
import { ImageOff } from 'lucide-react'

interface OfflineImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | undefined
  fallbackIcon?: React.ReactNode
}

export function OfflineImage({ src, fallbackIcon, className, ...props }: OfflineImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    if (!src) {
      setResolvedSrc(undefined)
      return
    }

    // Eski R2 Public URL ile kaydedilmiş fotoğrafları otomatik olarak Worker URL'sine çevir
    let finalSrc = src
    if (finalSrc.includes('pub-') && finalSrc.includes('.r2.dev')) {
      // Hatalı veya değişmiş public URL'leri yakala ve doğru worker URL'si ile değiştir
      finalSrc = finalSrc.replace(/https?:\/\/pub-[a-zA-Z0-9]+(\.r2\.dev)?/g, 'https://ogretmen-yardimci-r2.meteaydo.workers.dev')
    }

    if (finalSrc.startsWith('local://')) {
      getLocalImageUrl(finalSrc).then((blobUrl) => {
        if (active) {
          if (blobUrl) setResolvedSrc(blobUrl)
          else setError(true) // Blob not found in IndexedDB
        }
      })
    } else {
      setResolvedSrc(finalSrc)
    }

    return () => { active = false }
  }, [src])

  if (!src) return fallbackIcon ? <>{fallbackIcon}</> : null

  if (error || !resolvedSrc) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className}`}>
        {error ? <ImageOff className="h-5 w-5" /> : <div className="animate-pulse w-full h-full bg-muted-foreground/20" />}
      </div>
    )
  }

  return <img src={resolvedSrc} className={className} onError={() => setError(true)} {...props} />
}
