import { createAsyncLocalStorage } from './async-local-storage'

export interface SuspenseBoundarySource {
  fileName: string
  lineNumber: number
  columnNumber: number
}

export interface SuspenseBoundaryInfo {
  id: string
  source: SuspenseBoundarySource | null
  parentId: string | null
  children: string[]
}

export interface SuspenseBoundaryCollectorStore {
  boundaries: Map<string, SuspenseBoundaryInfo>
  idCounter: number
  parentStack: string[]
}

export const suspenseBoundaryCollectorStorage =
  createAsyncLocalStorage<SuspenseBoundaryCollectorStore>()

export function createSuspenseBoundaryCollector(): SuspenseBoundaryCollectorStore {
  return {
    boundaries: new Map(),
    idCounter: 0,
    parentStack: [],
  }
}

export function registerSuspenseBoundary(
  source: SuspenseBoundarySource | null
): string {
  const store = suspenseBoundaryCollectorStorage.getStore()
  if (!store) {
    return ''
  }

  const id = `suspense-${store.idCounter++}`
  const parentId = store.parentStack[store.parentStack.length - 1] || null

  // Register this boundary
  store.boundaries.set(id, {
    id,
    source,
    parentId,
    children: [],
  })

  // Add to parent's children list
  if (parentId) {
    const parent = store.boundaries.get(parentId)
    if (parent) {
      parent.children.push(id)
    }
  }

  return id
}

export function pushSuspenseBoundary(id: string): void {
  const store = suspenseBoundaryCollectorStorage.getStore()
  if (store && id) {
    store.parentStack.push(id)
  }
}

export function popSuspenseBoundary(): void {
  const store = suspenseBoundaryCollectorStorage.getStore()
  if (store) {
    store.parentStack.pop()
  }
}

export function getSuspenseBoundaries(): SuspenseBoundaryInfo[] {
  const store = suspenseBoundaryCollectorStorage.getStore()
  if (!store) {
    return []
  }
  return Array.from(store.boundaries.values())
}

export function serializeSuspenseBoundaries(): string {
  const boundaries = getSuspenseBoundaries()
  return JSON.stringify({
    boundaries,
    timestamp: Date.now(),
  })
}
