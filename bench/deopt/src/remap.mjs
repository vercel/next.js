import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import { repoRoot } from './util.mjs'

/**
 * Maps positions from served chunks back to the sources you'd actually edit.
 *
 * Hop 1: chunk position -> bundle input, via the chunk's `.map` on disk
 *        (requires `productionBrowserSourceMaps: true` in the fixture).
 *        For framework code the bundle input is `packages/next/dist/esm/...`.
 * Hop 2: dist file position -> the TypeScript sources under
 *        `packages/next/src`, via the `.map` files the next build emits next
 *        to every dist file.
 */
export class Remapper {
  constructor({ baseURL = null, appDir = null } = {}) {
    this.baseURL = baseURL ? baseURL.replace(/\/$/, '') : null
    this.appDir = appDir
    /** @type {Map<string, TraceMap | null>} */
    this.traceMaps = new Map()
  }

  #mapFileForUrl(url) {
    if (this.baseURL && url.startsWith(this.baseURL + '/')) {
      const pathname = new URL(url).pathname
      if (pathname.startsWith('/_next/') && this.appDir) {
        return mapFileForLocalFile(
          path.join(this.appDir, '.next', pathname.slice('/_next/'.length))
        )
      }
      return null
    }
    if (url.startsWith('file://')) {
      return mapFileForLocalFile(fileURLToPath(url))
    }
    if (url.startsWith('/')) {
      return mapFileForLocalFile(url)
    }
    return null
  }

  #traceMapFor(file) {
    if (!this.traceMaps.has(file)) {
      let traceMap = null
      try {
        traceMap = new TraceMap(JSON.parse(fs.readFileSync(file, 'utf8')))
      } catch {}
      this.traceMaps.set(file, traceMap)
    }
    return this.traceMaps.get(file)
  }

  /**
   * V8 log positions are 1-based line and column; trace-mapping expects
   * 1-based line, 0-based column.
   */
  #lookup(traceMap, line, column) {
    for (const col of [column - 1, column]) {
      const pos = originalPositionFor(traceMap, {
        line,
        column: Math.max(col, 0),
      })
      if (pos.source != null) return pos
    }
    return null
  }

  /**
   * @returns {{source: string, line: number|null, column: number|null, name: string|null} | null}
   *   `source` is repo-root-relative when possible.
   */
  remap(url, line, column) {
    if (url == null || line == null) return null
    const mapFile = this.#mapFileForUrl(url)
    if (!mapFile) return null
    const traceMap = this.#traceMapFor(mapFile)
    if (!traceMap) return null
    const hop1 = this.#lookup(traceMap, line, column ?? 1)
    if (!hop1) return null

    const normalized = normalizeSource(hop1.source, path.dirname(mapFile))

    // Second hop: bundle inputs under packages/next/dist have their own maps
    // pointing at the TypeScript sources.
    const abs = path.join(repoRoot(), normalized)
    if (
      normalized.includes('/dist/') &&
      hop1.line != null &&
      fs.existsSync(abs + '.map')
    ) {
      const distMap = this.#traceMapFor(abs + '.map')
      if (distMap) {
        const hop2 = this.#lookup(distMap, hop1.line, (hop1.column ?? 0) + 1)
        if (hop2) {
          return {
            source: normalizeSource(hop2.source, path.dirname(abs)),
            line: hop2.line,
            column: hop2.column,
            name: hop2.name ?? hop1.name ?? null,
          }
        }
      }
    }

    return {
      source: normalized,
      line: hop1.line,
      column: hop1.column,
      name: hop1.name ?? null,
    }
  }
}

/**
 * Locate the sourcemap for a file on disk. Bundlers (Turbopack in
 * particular) name maps independently of their chunks, so the trailing
 * `//# sourceMappingURL=` comment is authoritative; `<file>.map` adjacency
 * is only a fallback.
 */
function mapFileForLocalFile(file) {
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const { size } = fs.fstatSync(fd)
      const length = Math.min(1024, size)
      const buffer = Buffer.alloc(length)
      fs.readSync(fd, buffer, 0, length, size - length)
      const match = [
        ...buffer.toString('utf8').matchAll(/\/\/[#@] sourceMappingURL=(\S+)/g),
      ].pop()
      if (match && !match[1].startsWith('data:')) {
        return path.resolve(path.dirname(file), decodeURIComponent(match[1]))
      }
    } finally {
      fs.closeSync(fd)
    }
  } catch {}
  return file + '.map'
}

/**
 * Normalize a sourcemap `sources` entry to a repo-root-relative path when
 * possible: strips bundler URL schemes and resolves relative segments
 * against the map's own directory.
 */
export function normalizeSource(source, mapDir) {
  let s = source
  s = s.replace(/^webpack:\/\/_N_E\//, '')
  s = s.replace(/^webpack:\/\/\//, '')
  s = s.replace(/^webpack:\/\//, '')
  s = s.replace(/^turbopack:\/\/\/?\[project\]\//, '')
  s = s.replace(/^\[project\]\//, '')
  // Turbopack's [project] root is the main checkout; when running from a
  // git worktree under .claude/worktrees, sources carry the worktree prefix.
  // Strip it so findings are stable repo-relative paths.
  s = s.replace(/^\.claude\/worktrees\/[^/]+\//, '')
  if (s.startsWith('file://')) {
    s = fileURLToPath(s)
  }
  if (s.startsWith('.')) {
    s = path.resolve(mapDir, s)
  }
  if (path.isAbsolute(s)) {
    const rel = path.relative(repoRoot(), s)
    if (!rel.startsWith('..')) return rel
    return s
  }
  return s
}
