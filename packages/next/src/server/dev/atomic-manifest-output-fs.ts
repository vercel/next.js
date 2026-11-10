import path from 'path'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { writeFileAtomic } from '../../lib/fs/write-atomic'

type OutputFileSystem = NonNullable<webpack.Compiler['outputFileSystem']>
type WriteFile = OutputFileSystem['writeFile']
type WriteCallback = Parameters<WriteFile>[2]

const MANIFEST_FILE_RE = /manifest\.(?:js|json)$/i

/**
 * Whether the dev server reads this emitted file outside of webpack, e.g.
 * through `loadManifest` / `evalManifest`. `build-manifest.json`,
 * `next-font-manifest.json`, `page_client-reference-manifest.js` and so on.
 */
export function isManifestFile(filePath: string): boolean {
  return MANIFEST_FILE_RE.test(path.basename(filePath))
}

/**
 * Returns a webpack output file system that writes manifest files atomically.
 *
 * Webpack writes emitted assets in place, truncating the file first. In dev,
 * a request that renders an already-built route (it doesn't wait for an
 * in-flight rebuild) can read a manifest while it is being rewritten. It then
 * sees an empty or partial file and fails with `Manifest file is empty` or
 * `Unexpected end of JSON input`. Writing manifests with `writeFileAtomic`
 * (temp file + rename, the same helper Turbopack's manifests use) means a
 * reader sees either the old or the new manifest.
 *
 * Manifests are written straight to disk with Node's `fs`, bypassing the given
 * file system's `writeFile`. That is intended for Next.js's disk-backed dev output: the
 * dev server reads these manifests from disk with Node's `fs` anyway, and
 * Next.js doesn't set a custom output file system.
 *
 * The returned object inherits every other method from `fs`, which is left
 * untouched. Webpack shares one file system object (graceful-fs) between all
 * compilers, so it must not be patched in place.
 */
export function createAtomicManifestOutputFileSystem(
  fs: OutputFileSystem
): OutputFileSystem {
  const writeFile = fs.writeFile.bind(fs)

  const atomicWriteFile = ((
    filePath: string,
    content: string | Buffer,
    callback: WriteCallback
  ) => {
    if (!isManifestFile(filePath)) {
      return writeFile(filePath, content, callback)
    }

    let error: NodeJS.ErrnoException | null = null
    try {
      writeFileAtomic(filePath, content)
    } catch (err) {
      error = err as NodeJS.ErrnoException
    }
    // Call back asynchronously, like `fs.writeFile`, and outside the `try` so
    // an exception thrown by the callback doesn't call it a second time.
    process.nextTick(callback, error)
  }) as WriteFile

  const wrapped = Object.create(fs) as OutputFileSystem
  wrapped.writeFile = atomicWriteFile
  return wrapped
}
