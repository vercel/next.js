/**
 * Unlike most files in this folder, this one is not an extension itself. It
 * keeps graceful-fs from wrapping Node's global `fs.close` and `fs.closeSync`,
 * because the wrappers make the dev server report sync IO that user code never
 * did.
 *
 * graceful-fs ships inside Next.js (bundled into watchpack, webpack, and nft),
 * and apps can load their own copy (fs-extra depends on it). The first copy to
 * load wraps the global `fs.close` and `fs.closeSync`, so that a close anywhere
 * in the process retries operations that failed with EMFILE. The wrappers call
 * `Date.now()` on every close.
 *
 * The dev server renders in the same process that runs the bundler. A close
 * during a render runs that `Date.now()` inside the render's work unit store,
 * and the `Date` extension (`./date.tsx`) reports it as sync IO. Renders close
 * files when user code calls `fs.readFileSync(path)` without an encoding, and on
 * Node.js 22+ when `import()` loads an unbundled ES module, because Node reads
 * the module source with `fs.readFileSync`.
 *
 * A copy of graceful-fs skips the wrapping when it finds the shared queue at
 * `fs[Symbol.for('graceful-fs.queue')]`: that's how its copies avoid wrapping
 * twice. Publishing the queue before any copy loads keeps the wrappers out.
 * Calls made through graceful-fs keep their EMFILE retries: its timer retries
 * queued operations, though a close elsewhere no longer wakes it early, and a
 * queued operation gives up 60 seconds after it first failed instead of 60
 * seconds after the latest close.
 */
import fs from 'fs'

const GRACEFUL_FS_QUEUE = Symbol.for('graceful-fs.queue')
// graceful-fs's close wrappers keep the function they wrap under this key.
const GRACEFUL_FS_PREVIOUS = Symbol.for('graceful-fs.previous')

export function preventGracefulFsGlobalPatch(): void {
  if (Reflect.get(fs, GRACEFUL_FS_QUEUE)) {
    // A copy already loaded, for example from a custom server that required
    // fs-extra before Next.js. Later copies won't wrap again, so unwrapping
    // once is enough.
    restoreUnwrapped('close')
    restoreUnwrapped('closeSync')
    return
  }

  // Mirrors graceful-fs's own one-time setup, minus the wrapping.
  const queue: unknown[] = Reflect.get(globalThis, GRACEFUL_FS_QUEUE) || []
  publishQueue(fs, queue)
  if (!Reflect.get(globalThis, GRACEFUL_FS_QUEUE)) {
    publishQueue(globalThis, queue)
  }
}

function publishQueue(target: object, queue: unknown[]): void {
  Object.defineProperty(target, GRACEFUL_FS_QUEUE, { get: () => queue })
}

function restoreUnwrapped(name: 'close' | 'closeSync'): void {
  const unwrapped: unknown = Reflect.get(fs[name], GRACEFUL_FS_PREVIOUS)
  if (typeof unwrapped === 'function') {
    Reflect.set(fs, name, unwrapped)
  }
}
