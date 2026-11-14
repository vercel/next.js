/**
 * Native npm packages ship one prebuilt binary per (platform, arch, libc)
 * target and declare every target as an optional dependency. Package managers
 * install all of the targets whose `os`/`cpu` fields match the host, and
 * neither field describes the C library, so any Linux machine ends up with
 * both the glibc and the musl build of a package such as `sharp` or
 * `@swc/core` in `node_modules`.
 *
 * File tracing follows the package root, so both builds are copied into the
 * traced output even though only one of them can ever be dynamically loaded.
 * A binary linked against musl cannot load on a glibc host and vice versa, so
 * the other one is dead weight — for `sharp` and `@swc/core` together it is
 * roughly 77 MB, which is enough to push a deployment past a platform size
 * limit such as AWS Lambda's 250 MiB unzipped ceiling.
 *
 * When the build runs on Linux the libc of the produced output is known, so
 * the builds that target the other libc can be left out of the trace. On any
 * other platform the eventual target is unknown — a macOS build may well be
 * copied into a Linux container — so nothing is filtered.
 */

/**
 * Package-name conventions used by the native packages themselves:
 *
 * - napi-rs appends the libc to the triple, e.g. `@swc/core-linux-x64-musl`.
 * - sharp and libvips fold it into the platform, e.g.
 *   `@img/sharp-linuxmusl-x64`, `@img/sharp-libvips-linuxmusl-x64`.
 */
const MUSL_PACKAGE_IGNORES = [
  '**/node_modules/**/*-linux-*-musl/**/*',
  '**/node_modules/**/*-linuxmusl-*/**/*',
]

/**
 * `glibcVersionRuntime` is only present in the Node.js report when the running
 * binary is linked against glibc. This is the same signal `detect-libc` uses.
 */
function isMuslHost(): boolean {
  const report = process.report?.getReport?.() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined

  return !report?.header?.glibcVersionRuntime
}

/**
 * Trace ignore globs for native packages that target a libc the build output
 * cannot load. Returns an empty list whenever the target libc is not known.
 */
export function getCrossLibcIgnores(): string[] {
  if (process.platform !== 'linux') {
    return []
  }

  // Only glibc hosts are filtered for now. The glibc builds of some packages
  // (`@img/sharp-linux-x64`) carry no libc marker in their name, so there is
  // no equally safe glob for the musl-host direction.
  if (isMuslHost()) {
    return []
  }

  return MUSL_PACKAGE_IGNORES
}
