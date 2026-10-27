import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

/**
 * sharp picks its binding when it is loaded: the prebuilt native binding for
 * the current platform (`@img/sharp-<platform>`) if that package can be
 * resolved, otherwise the WebAssembly binding (`@img/sharp-wasm32`). Which one
 * an app gets is decided at install time (`npm install sharp` vs
 * `npm install --cpu=wasm32 sharp`, the fallback Next.js documents when the
 * native binaries cannot be used).
 *
 * These helpers name the packages involved so tests can take the native
 * binding away and exercise the image optimizer on the WebAssembly binding.
 */

/** Mirrors `runtimePlatformArch()` in sharp's `lib/libvips.js`. */
export function sharpRuntimePlatform(): string {
  const libc = process.platform === 'linux' && isMusl() ? 'musl' : ''
  return `${process.platform}${libc}-${process.arch}`
}

function isMusl(): boolean {
  const report = process.report?.getReport() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined
  const header = report?.header
  return header !== undefined && header.glibcVersionRuntime === undefined
}

/** The native binding package sharp prefers on this platform. */
export function nativeSharpBindingPackage(): string {
  return `@img/sharp-${sharpRuntimePlatform()}`
}

/** The prebuilt libvips the native binding links against (Linux and macOS). */
export function nativeSharpLibvipsPackage(): string {
  return `@img/sharp-libvips-${sharpRuntimePlatform()}`
}

/** The `require('sharp')` specifier sharp uses for the native binding. */
export function nativeSharpBindingSpecifier(): string {
  return `${nativeSharpBindingPackage()}/sharp.node`
}

/**
 * The version of sharp that `packages/next` resolved in this checkout, i.e.
 * the one `@img/sharp-wasm32` has to match.
 */
export function workspaceSharpVersion(): string {
  const nextRequire = createRequire(require.resolve('next/package.json'))
  // sharp's `exports` map does not expose its package.json, so walk up from
  // the resolved entry point to the package root.
  let dir = path.dirname(nextRequire.resolve('sharp'))
  while (true) {
    const packageJson = path.join(dir, 'package.json')
    if (fs.existsSync(packageJson)) {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'))
      if (pkg.name === 'sharp') {
        return pkg.version
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error('Could not find the package.json of sharp')
    }
    dir = parent
  }
}
