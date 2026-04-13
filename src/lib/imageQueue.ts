import { openDB } from 'idb'
import imageCompression from 'browser-image-compression'
import { uploadToR2 } from './r2'
import { db } from './firebase'
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'

interface QueueItem {
  id: string
  file: Blob
  key: string
  firebaseDocInfo: {
    collection: string
    docId: string
    field: string // 'foto' | 'kameraFoto' | 'ozelDurumFotolari'
    isArray?: boolean
  }
}

const DB_NAME = 'image-queue-db'
const STORE_NAME = 'queue'

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    },
  })
}

// Global queue processing state
let isProcessing = false

export async function processQueue() {
  if (isProcessing || !navigator.onLine) return
  isProcessing = true

  try {
    const idb = await getDb()
    const items: QueueItem[] = await idb.getAll(STORE_NAME)

    for (const item of items) {
      try {
        // Upload to R2
        const r2Url = await uploadToR2(item.file, item.key)

        // Update Firebase
        const docRef = doc(db, item.firebaseDocInfo.collection, item.firebaseDocInfo.docId)
        
        if (item.firebaseDocInfo.isArray) {
          // Atomik güncelleme: aynı anda hem sil hem ekle
          await updateDoc(docRef, {
            [item.firebaseDocInfo.field]: arrayRemove(`local://${item.id}`),
          });
          await updateDoc(docRef, {
            [item.firebaseDocInfo.field]: arrayUnion(r2Url),
          });
        } else {
          // Basit alan güncelleme
          await updateDoc(docRef, {
            [item.firebaseDocInfo.field]: r2Url
          })
        }

        // Remove from queue
        await idb.delete(STORE_NAME, item.id)
      } catch (err: any) {
        const path = `${item.firebaseDocInfo.collection}/${item.firebaseDocInfo.docId}`;
        console.error(`Kuyruk upload hatası (Yol: ${path}):`, {
          message: err.message,
          code: err.code,
          item
        });

        // Eğer izin reddedildiyse (dosya silinmiş veya sınıf değişmiş), bu görevi kuyruktan SİL.
        // Yoksa sonsuza kadar hata vermeye devam eder.
        if (err.code === 'permission-denied') {
          const idb = await getDb();
          await idb.delete(STORE_NAME, item.id);
          console.warn(`Kuyruk öğesi yetki hatası nedeniyle silindi: ${path}`);
        }

        // Şebeke hatası ise dur, değilse (veya izin hatasıysa) sonraki öğeye geç
        if (!navigator.onLine) break;
      }
    }
  } finally {
    isProcessing = false
  }
}

// Automatically process queue when online
window.addEventListener('online', processQueue)
// Start processing on load just in case
processQueue()

export async function queueImageUpload(
  fileOrBlob: Blob | File,
  key: string,
  firebaseDocInfo: QueueItem['firebaseDocInfo']
): Promise<string> {
  // Compress image
  const options = {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1280,
    useWebWorker: true,
  }
  
  const fileToCompress = fileOrBlob instanceof File ? fileOrBlob : new File([fileOrBlob], 'image.jpg', { type: fileOrBlob.type || 'image/jpeg' })
  const compressedFile = await imageCompression(fileToCompress, options)

  const id = crypto.randomUUID()
  const localUrl = `local://${id}`

  // Save to IndexedDB
  const idb = await getDb()
  await idb.put(STORE_NAME, {
    id,
    file: compressedFile,
    key,
    firebaseDocInfo,
  })

  // Try to upload immediately in background
  processQueue()

  return localUrl
}

// Helper to get local blob URL for UI
const objectUrlCache = new Map<string, string>()

export async function getLocalImageUrl(localUrl: string): Promise<string | null> {
  if (!localUrl.startsWith('local://')) return null
  
  if (objectUrlCache.has(localUrl)) {
    return objectUrlCache.get(localUrl)!
  }

  const id = localUrl.replace('local://', '')
  try {
    const idb = await getDb()
    const item: QueueItem | undefined = await idb.get(STORE_NAME, id)
    if (item) {
      const url = URL.createObjectURL(item.file)
      objectUrlCache.set(localUrl, url)
      return url
    }
  } catch (err) {
    console.error('Local image fetch error:', err)
  }
  return null
}
