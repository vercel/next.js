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

export function evalManifest(path: string, shouldCache: boolean = true) {
  const cached = shouldCache && cache.get(path)

  if (cached) {
    return
  }

  const content = readFileSync(path, 'utf8')
  if (content.length === 0) {
    throw new Error('Manifest file is empty')
  }

  //@ts-ignore
  // eslint-disable-next-line no-eval
  ;(0, eval)(content)

  if (shouldCache) {
    cache.set(path, true)
  }

  return
}

export function clearManifestCache(path: string): boolean {
  return cache.delete(path)
}
