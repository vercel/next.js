import { readFileSync } from 'fs'

const cache = new Map<string, any>()

export function loadManifest(path: string, shouldCache: boolean = true) {
  const cached = shouldCache && cache.get(path)

  if (cached) {
    return cached
  }

  const manifest = JSON.parse(readFileSync(path, 'utf8'))

  if (shouldCache) {
    cache.set(path, manifest)
  }

  return manifest
}

export function clearManifestCache(path: string): boolean {
  return cache.delete(path)
}
