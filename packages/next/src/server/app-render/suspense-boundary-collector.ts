import type { AsyncLocalStorage } from 'async_hooks'
import { createAsyncLocalStorage } from './async-local-storage'

export interface StackFrame {
  componentName: string
  fileName: string | null
  lineNumber: number | null
  columnNumber: number | null
}

export interface DynamicAPIAccess {
  expression: string // e.g., "cookies", "headers", "connection"
  frames: StackFrame[] // owner stack at the point of call
}

export interface SuspenseBoundaryInfo {
  id: string
  frames: StackFrame[]
}

export interface SuspenseBoundaryCollectorStore {
  boundaries: Map<string, SuspenseBoundaryInfo>
  idCounter: number
  // Track dynamic API accesses that occurred during the render
  dynamicAccesses: DynamicAPIAccess[]
}

// Use globalThis to ensure singleton across module duplications (vendored React bundles separately)
const globalKey = '__NEXT_SUSPENSE_BOUNDARY_COLLECTOR_STORAGE__'

function getOrCreateStorage(): AsyncLocalStorage<SuspenseBoundaryCollectorStore> {
  const g = globalThis as any
  if (!g[globalKey]) {
    g[globalKey] = createAsyncLocalStorage<SuspenseBoundaryCollectorStore>()
  }
  return g[globalKey]
}

export const suspenseBoundaryCollectorStorage = getOrCreateStorage()

export function createSuspenseBoundaryCollector(): SuspenseBoundaryCollectorStore {
  return {
    boundaries: new Map(),
    idCounter: 0,
    dynamicAccesses: [],
  }
}

/**
 * Track a dynamic API access (e.g., cookies(), headers(), connection())
 * This is called from dynamic-rendering.ts when a dynamic API is used
 */
export function trackDynamicAPIAccess(
  expression: string,
  ownerStack: string | null
): void {
  const store = suspenseBoundaryCollectorStorage.getStore()
  if (!store) {
    return
  }

  store.dynamicAccesses.push({
    expression,
    frames: parseOwnerStack(ownerStack),
  })
}

/**
 * Parse owner stack string into structured stack frames
 * Format: "    at ComponentName (file:line:col)\n    at Parent..."
 * Or: "    at ComponentName (file:line:col)"
 * Or: "    at file:line:col" (anonymous)
 */
function parseOwnerStack(ownerStack: string | null): StackFrame[] {
  if (!ownerStack) return []

  const frames: StackFrame[] = []
  const lines = ownerStack.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('at ')) continue

    // Try to match "at ComponentName (file:line:col)"
    const namedMatch = trimmed.match(
      /^at\s+([^\s(]+)\s+\((.+):(\d+):(\d+)\)$/
    )
    if (namedMatch) {
      frames.push({
        componentName: namedMatch[1],
        fileName: namedMatch[2],
        lineNumber: parseInt(namedMatch[3], 10),
        columnNumber: parseInt(namedMatch[4], 10),
      })
      continue
    }

    // Try to match "at ComponentName (file:line)"
    const namedNoColMatch = trimmed.match(
      /^at\s+([^\s(]+)\s+\((.+):(\d+)\)$/
    )
    if (namedNoColMatch) {
      frames.push({
        componentName: namedNoColMatch[1],
        fileName: namedNoColMatch[2],
        lineNumber: parseInt(namedNoColMatch[3], 10),
        columnNumber: null,
      })
      continue
    }

    // Try to match "at file:line:col" (anonymous)
    const anonMatch = trimmed.match(/^at\s+(.+):(\d+):(\d+)$/)
    if (anonMatch) {
      frames.push({
        componentName: '<anonymous>',
        fileName: anonMatch[1],
        lineNumber: parseInt(anonMatch[2], 10),
        columnNumber: parseInt(anonMatch[3], 10),
      })
      continue
    }

    // Try to match "at ComponentName" (no file info)
    const nameOnlyMatch = trimmed.match(/^at\s+([^\s(]+)$/)
    if (nameOnlyMatch) {
      frames.push({
        componentName: nameOnlyMatch[1],
        fileName: null,
        lineNumber: null,
        columnNumber: null,
      })
      continue
    }
  }

  return frames
}

export function registerSuspenseBoundary(ownerStack: string | null): string {
  const store = suspenseBoundaryCollectorStorage.getStore()
  if (!store) {
    return ''
  }

  const id = `suspense-${store.idCounter++}`
  const frames = parseOwnerStack(ownerStack)

  store.boundaries.set(id, {
    id,
    frames,
  })

  return id
}

export function getSuspenseBoundaries(): SuspenseBoundaryInfo[] {
  const store = suspenseBoundaryCollectorStorage.getStore()
  if (!store) {
    return []
  }
  return Array.from(store.boundaries.values())
}

export function getDynamicAccesses(): DynamicAPIAccess[] {
  const store = suspenseBoundaryCollectorStorage.getStore()
  if (!store) {
    return []
  }
  return store.dynamicAccesses
}
