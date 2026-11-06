import { parsePreferences, type CaptureRecord, type Preferences } from "./model"

export async function getPreferences(): Promise<Preferences> {
  if (!globalThis.chrome?.storage) {
    return parsePreferences(JSON.parse(localStorage.getItem("preferences") ?? "{}"))
  }
  const data = await chrome.storage.local.get("preferences")
  return parsePreferences(data.preferences)
}

export async function savePreferences(preferences: Preferences) {
  if (!globalThis.chrome?.storage) {
    localStorage.setItem("preferences", JSON.stringify(preferences))
    return
  }
  await chrome.storage.local.set({ preferences })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("encuadre-temporary", 1)
    request.onupgradeneeded = () => request.result.createObjectStore("captures", { keyPath: "id" })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveCapture(record: CaptureRecord) {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("captures", "readwrite")
      const store = transaction.objectStore("captures")
      // Keep only the current result, never a capture history.
      store.clear()
      store.put(record)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally { db.close() }
}

export async function readCapture(id: string): Promise<CaptureRecord | undefined> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("captures").objectStore("captures").get(id)
      request.onsuccess = () => resolve(request.result as CaptureRecord | undefined)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

export async function clearCaptures() {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("captures", "readwrite")
      tx.objectStore("captures").clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally { db.close() }
}
