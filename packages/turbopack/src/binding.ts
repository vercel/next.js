import { existsSync, readdirSync } from 'fs'
import { arch, platform } from 'os'
import path from 'path'

/**
 * Opaque native handles. Mirrors the `{ __napiType }`-tagged externals the addon returns.
 */
export type NativeProject = { __napiType: 'Project' }
export type NativeRootTask = { __napiType: 'RootTask' }

export interface NapiProjectOptions {
  rootPath: string
  entries: string[]
  distDir?: string
}

/** Build provenance baked into the native addon (from `build.rs`). */
export interface NapiBuildInfo {
  version: string
  gitSha: string
  gitDirty: boolean
}

/** The raw functions exported by the `.node` addon (camelCase — napi converts from snake_case). */
export interface RawBinding {
  buildInfo(): NapiBuildInfo
  projectNew(options: NapiProjectOptions): Promise<NativeProject>
  projectBuild(project: NativeProject): Promise<void>
}

/**
 * On Linux, is the C library musl (Alpine etc.) rather than glibc? Uses Node's own libc detection
 * via `process.report` — no dependency. glibc runtime present -> gnu; absent -> musl.
 */
export function isMusl(): boolean {
  if (platform() !== 'linux') return false
  try {
    const report = (
      process.report as { getReport?: () => unknown } | undefined
    )?.getReport?.() as
      | { header?: { glibcVersionRuntime?: string }; sharedObjects?: string[] }
      | undefined
    if (report?.header?.glibcVersionRuntime) return false
    if (Array.isArray(report?.sharedObjects)) {
      return report.sharedObjects.some((o) => /libc\.musl-|ld-musl-/.test(o))
    }
    // No glibc runtime reported and no shared-object hint → assume musl.
    return true
  } catch {
    return false
  }
}

/**
 * The napi platform-arch-abi triple (matches the per-platform npm package suffix and the
 * `turbopack.<triple>.node` filename): `darwin-arm64`, `linux-x64-musl`, `win32-x64-msvc`, …
 */
export function tripleName(
  p: NodeJS.Platform = platform(),
  a: string = arch(),
  musl: boolean = isMusl()
): string {
  switch (p) {
    case 'darwin':
      return `darwin-${a}`
    case 'win32':
      return `win32-${a}-msvc`
    case 'linux':
      return `linux-${a}-${musl ? 'musl' : 'gnu'}`
    default:
      return `${p}-${a}`
  }
}

/** The published per-platform package name for a triple, e.g. `turbopack-darwin-arm64`. */
export function platformPackageName(triple: string = tripleName()): string {
  return `turbopack-${triple}`
}

let cached: RawBinding | undefined

export function loadBinding(): RawBinding {
  if (cached) return cached

  const nativeDir = path.join(__dirname, '..', 'native')
  const triple = tripleName()
  const attempts: string[] = []

  // Resolution order:
  //   1. the published per-platform package (`turbopack-<triple>`) — what `npm i` installs;
  //   2. a locally-built binary in `native/turbopack.<triple>.node`;
  //   3. any single `.node` in `native/` (covers a hand-built/renamed binary).
  const candidates: string[] = [
    platformPackageName(triple),
    path.join(nativeDir, `turbopack.${triple}.node`),
    ...(existsSync(nativeDir)
      ? readdirSync(nativeDir)
          .filter((f) => f.endsWith('.node'))
          .map((f) => path.join(nativeDir, f))
      : []),
  ]

  for (const candidate of candidates) {
    try {
      cached = require(candidate) as RawBinding
      return cached
    } catch (err) {
      attempts.push(`  ${candidate}: ${(err as Error).message}`)
    }
  }

  throw new Error(
    `Failed to load the turbopack native addon for ${triple}. Tried:\n${attempts.join('\n')}\n` +
      `Build it with: pnpm --filter turbopack build-native`
  )
}
