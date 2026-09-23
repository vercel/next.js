import * as path from 'node:path'
import { readFile } from 'node:fs/promises'
import { AnalyzeData, ModulesData } from '../../shared/lib/analyze-data'
import type { SnapshotMetadata } from './snapshot'

const SNAPSHOT_ID = /^\d{8}-\d{6}-(?:[0-9a-f]{7}|local)$/
const MAX_ROUTE_DATASETS = 8
const MAX_MODULE_DATASETS = 4
const MAX_INDEX_BYTES = 1024 * 1024
const MAX_HISTORY_ENTRIES = 100

interface HistoryIndex {
  snapshots: SnapshotMetadata[]
}

export interface SnapshotDataset {
  key: string
  metadata: SnapshotMetadata
  routes: string[]
  directory: string
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer
}

function validateStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

function validateMetadata(value: unknown, label: string): SnapshotMetadata {
  const metadata = value as SnapshotMetadata
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof metadata.id !== 'string' ||
    !SNAPSHOT_ID.test(metadata.id) ||
    typeof metadata.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(metadata.createdAt)) ||
    !Number.isSafeInteger(metadata.routeCount) ||
    metadata.routeCount < 0
  ) {
    throw new Error(`Invalid ${label}`)
  }
  return metadata
}

async function readJson(filename: string, label: string): Promise<unknown> {
  const contents = await readFile(filename)
  if (contents.byteLength > MAX_INDEX_BYTES) throw new Error(`Invalid ${label}`)
  try {
    return JSON.parse(contents.toString('utf8'))
  } catch {
    throw new Error(`Invalid ${label}`)
  }
}

function assertInside(base: string, candidate: string): void {
  const relative = path.relative(base, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Requested analyzer data path is outside its snapshot')
  }
}

function validateRoute(route: string): void {
  if (
    !route.startsWith('/') ||
    route.includes('\\') ||
    route.includes('\0') ||
    route.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error('Invalid route')
  }
  try {
    const decoded = decodeURIComponent(route)
    if (
      decoded.includes('\\') ||
      decoded.includes('\0') ||
      decoded.split('/').some((segment) => segment === '.' || segment === '..')
    ) {
      throw new Error('Invalid route')
    }
  } catch {
    throw new Error('Invalid route')
  }
}

function insertBounded<T>(
  map: Map<string, T>,
  key: string,
  value: T,
  max: number
) {
  map.delete(key)
  map.set(key, value)
  while (map.size > max) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

export class AnalyzeRepository {
  private readonly routeCache = new Map<string, Promise<AnalyzeData>>()
  private readonly modulesCache = new Map<string, Promise<ModulesData>>()

  constructor(private readonly analyzeDir: string) {}

  async listSnapshots(): Promise<{
    current: SnapshotMetadata
    history: SnapshotMetadata[]
  }> {
    const current = validateMetadata(
      await readJson(
        path.join(this.analyzeDir, 'data', 'metadata.json'),
        'current snapshot metadata'
      ),
      'current snapshot metadata'
    )
    let history: SnapshotMetadata[] = []
    try {
      const parsed = (await readJson(
        path.join(this.analyzeDir, 'history', 'history.json'),
        'snapshot history'
      )) as HistoryIndex
      if (
        !parsed ||
        !Array.isArray(parsed.snapshots) ||
        parsed.snapshots.length > MAX_HISTORY_ENTRIES
      ) {
        throw new Error('Invalid snapshot history')
      }
      history = parsed.snapshots
        .map((snapshot, index) =>
          validateMetadata(snapshot, `snapshot history entry ${index}`)
        )
        .sort((a, b) => {
          if (a.createdAt !== b.createdAt) {
            return a.createdAt < b.createdAt ? 1 : -1
          }
          return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
        })
      if (
        new Set(history.map((snapshot) => snapshot.id)).size !== history.length
      ) {
        throw new Error('Invalid snapshot history')
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return { current, history }
  }

  async getSnapshot(snapshot = 'current'): Promise<SnapshotDataset> {
    const snapshots = await this.listSnapshots()
    let metadata: SnapshotMetadata
    let directory: string
    if (snapshot === 'current') {
      metadata = snapshots.current
      directory = path.join(this.analyzeDir, 'data')
    } else {
      if (!SNAPSHOT_ID.test(snapshot))
        throw new Error('Invalid snapshot identifier')
      const match = snapshots.history.find(
        (candidate) => candidate.id === snapshot
      )
      if (!match) throw new Error(`Unknown snapshot: ${snapshot}`)
      metadata = match
      directory = path.join(this.analyzeDir, 'history', snapshot)
    }
    assertInside(this.analyzeDir, directory)
    const routes = validateStringArray(
      await readJson(path.join(directory, 'routes.json'), 'routes.json'),
      'routes.json'
    )
    for (const route of routes) validateRoute(route)
    if (routes.length !== metadata.routeCount) {
      throw new Error('Invalid routes.json')
    }
    return { key: snapshot, metadata, routes, directory }
  }

  async loadRoute(
    snapshot: string | undefined,
    route: string
  ): Promise<AnalyzeData> {
    validateRoute(route)
    const dataset = await this.getSnapshot(snapshot)
    if (!dataset.routes.includes(route))
      throw new Error(`Unknown route: ${route}`)
    const cacheKey = `${dataset.key}\0${route}`
    const cached = this.routeCache.get(cacheKey)
    if (cached) {
      insertBounded(this.routeCache, cacheKey, cached, MAX_ROUTE_DATASETS)
      return cached
    }
    const filename =
      route === '/'
        ? path.join(dataset.directory, 'analyze.data')
        : path.join(
            dataset.directory,
            ...route.slice(1).split('/'),
            'analyze.data'
          )
    assertInside(dataset.directory, filename)
    const loading = readFile(filename).then(
      (contents) => new AnalyzeData(toArrayBuffer(contents))
    )
    insertBounded(this.routeCache, cacheKey, loading, MAX_ROUTE_DATASETS)
    try {
      return await loading
    } catch (error) {
      this.routeCache.delete(cacheKey)
      throw error
    }
  }

  async loadModules(snapshot?: string): Promise<ModulesData> {
    const dataset = await this.getSnapshot(snapshot)
    const cached = this.modulesCache.get(dataset.key)
    if (cached) {
      insertBounded(this.modulesCache, dataset.key, cached, MAX_MODULE_DATASETS)
      return cached
    }
    const loading = readFile(path.join(dataset.directory, 'modules.data')).then(
      (contents) => new ModulesData(toArrayBuffer(contents))
    )
    insertBounded(this.modulesCache, dataset.key, loading, MAX_MODULE_DATASETS)
    try {
      return await loading
    } catch (error) {
      this.modulesCache.delete(dataset.key)
      throw error
    }
  }
}
