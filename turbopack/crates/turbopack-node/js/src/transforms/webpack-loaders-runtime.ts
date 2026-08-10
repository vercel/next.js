/**
 * In-memory CJS module evaluator for importModule bundles.
 *
 * The Rust side generates a full Node.js bundle (runtime + module chunks + entry
 * chunk) and sends the chunk code via IPC. This evaluator loads them in memory
 * using vm.compileFunction, wiring up a minimal CJS require that resolves
 * relative paths against an in-memory chunk map and delegates external packages
 * to the real Node.js require.
 */

import { createRequire } from 'module'
import realFs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import vm from 'vm'

// Create a real Node.js require function rooted at the project directory.
// This bypasses Turbopack's module analysis (which can't handle dynamic
// require calls) while still resolving npm packages correctly.
const nodeRequire = createRequire(process.cwd() + '/')

export interface ImportModuleResult {
  entryPath: string
  chunks: Array<{
    path: string
    code?: string
    binary?: string
    sourceMap?: string
  }>
}

export function evaluateBundle(result: ImportModuleResult): any {
  const chunkMap = new Map<string, string>()
  const binaryMap = new Map<string, Buffer>()
  for (const chunk of result.chunks) {
    if (chunk.code != null) {
      chunkMap.set('/' + chunk.path, chunk.code)
    }
    if (chunk.binary != null) {
      binaryMap.set('/' + chunk.path, Buffer.from(chunk.binary, 'base64'))
    }
  }

  // Patched fs module that intercepts reads of in-memory binary assets.
  // The Node.js runtime's WASM loader uses createReadStream() to load .wasm
  // files from disk; we need to redirect those reads to our in-memory buffers.
  let patchedFs: typeof realFs | undefined
  if (binaryMap.size > 0) {
    patchedFs = Object.create(realFs)
    patchedFs!.createReadStream = ((filePath: string, ...args: any[]): any => {
      const buf = binaryMap.get(filePath)
      if (buf) {
        return Readable.from(buf)
      }
      return realFs.createReadStream(filePath, ...args)
    }) as any
  }

  const moduleCache = new Map<string, { exports: any }>()

  function inMemoryRequire(fromPath: string, request: string): any {
    let resolved: string
    if (request.startsWith('/')) {
      resolved = request
    } else if (request.startsWith('./') || request.startsWith('../')) {
      resolved = path.resolve(path.dirname(fromPath), request)
    } else {
      // Intercept 'fs' to return the patched version when binary
      // assets are present (needed for WASM loading)
      if (request === 'fs' && patchedFs) {
        return patchedFs
      }
      // External package — use the real Node.js require
      return nodeRequire(request)
    }

    const cached = moduleCache.get(resolved)
    if (cached) return cached.exports

    const code = chunkMap.get(resolved)
    if (!code) {
      throw new Error(
        `importModule: chunk not found: ${resolved} (required from ${fromPath})`
      )
    }

    const mod = { exports: {} as any }
    moduleCache.set(resolved, mod)

    const localRequire: any = (req: string) => inMemoryRequire(resolved, req)
    localRequire.resolve = nodeRequire.resolve
    const fn = vm.compileFunction(
      code,
      ['module', 'exports', 'require', '__filename', '__dirname'],
      { filename: resolved }
    )
    fn(mod, mod.exports, localRequire, resolved, path.dirname(resolved))
    return mod.exports
  }

  return inMemoryRequire('/', '/' + result.entryPath)
}
