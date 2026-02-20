/**
 * IndexedDB storage for agent-cloud message images.
 *
 * Images are stored locally instead of Supabase to avoid 400 payload-size
 * errors.  Each image row is keyed by a composite of session ID + message
 * sequence number so we can bulk-load all images for a session efficiently.
 */

const DB_NAME = 'agent-cloud-images'
const DB_VERSION = 1
const STORE_NAME = 'images'

export interface StoredImage {
  /** Composite key: `${sessionId}:${sequenceNum}:${imageIndex}` */
  id: string
  sessionId: string
  sequenceNum: number
  data: string      // base64
  mimeType: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('sessionId', 'sessionId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Save images for a batch of messages.
 * `entries` maps sequenceNum -> image array.
 */
export async function saveImages(
  sessionId: string,
  entries: Array<{ sequenceNum: number; images: Array<{ data: string; type: string }> }>,
): Promise<void> {
  if (entries.length === 0) return
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    for (const entry of entries) {
      entry.images.forEach((img, idx) => {
        const row: StoredImage = {
          id: `${sessionId}:${entry.sequenceNum}:${idx}`,
          sessionId,
          sequenceNum: entry.sequenceNum,
          data: img.data,
          mimeType: img.type,
        }
        store.put(row)
      })
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (err) {
    console.error('[ImageDB] Error saving images:', err)
  }
}

/**
 * Load all images for a session, grouped by sequenceNum.
 */
export async function loadImagesBySession(
  sessionId: string,
): Promise<Map<number, Array<{ data: string; type: string }>>> {
  const result = new Map<number, Array<{ data: string; type: string }>>()
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('sessionId')
    const req = index.getAll(sessionId)

    const rows: StoredImage[] = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()

    for (const row of rows) {
      if (!result.has(row.sequenceNum)) {
        result.set(row.sequenceNum, [])
      }
      result.get(row.sequenceNum)!.push({ data: row.data, type: row.mimeType })
    }
  } catch (err) {
    console.error('[ImageDB] Error loading images:', err)
  }
  return result
}

/**
 * Delete all images for a session (used when deleting a session).
 */
export async function deleteImagesBySession(sessionId: string): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('sessionId')
    const req = index.getAllKeys(sessionId)

    const keys: IDBValidKey[] = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    for (const key of keys) {
      store.delete(key)
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (err) {
    console.error('[ImageDB] Error deleting images:', err)
  }
}
