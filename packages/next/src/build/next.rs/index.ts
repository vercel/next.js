/* eslint-disable @typescript-eslint/no-use-before-define */
import path from 'path'
import { pathToFileURL } from 'url'
import { platform, arch } from 'os'
import { platformArchTriples } from 'next/dist/compiled/@napi-rs/triples'
import * as Log from '../output/log'
import { getParserOptions } from './options'
import { eventSwcLoadFailure } from '../../telemetry/events/swc-load-failure'
import { patchIncorrectLockfile } from '../../lib/patch-incorrect-lockfile'
// TODO: rename file
import { downloadWasmNextRs } from '../../lib/download-wasm-swc'
import { loadNative, loadWasm } from '@next/rs'

const nextVersion = process.env.__NEXT_VERSION as string

const ArchName = arch()
const PlatformName = platform()
const triples = platformArchTriples[PlatformName][ArchName] || []

// Allow to specify an absolute path to the custom turbopack binary to load.
// If one of env variables is set, `loadNative` will try to use any turbo-* interfaces from specified
// binary instead. This will not affect existing swc's transform, or other interfaces. This is thin,
// naive interface - `loadBindings` will not validate neither path nor the binary.
//
// Note these are internal flag: there's no stability, feature guarantee.
const __INTERNAL_CUSTOM_TURBOPACK_BINARY =
  process.env.__INTERNAL_CUSTOM_TURBOPACK_BINARY
const __INTERNAL_CUSTOM_TURBOPACK_BINDINGS =
  process.env.__INTERNAL_CUSTOM_TURBOPACK_BINDINGS
export const __isCustomTurbopackBinary = async (): Promise<boolean> => {
  if (
    !!__INTERNAL_CUSTOM_TURBOPACK_BINARY &&
    !!__INTERNAL_CUSTOM_TURBOPACK_BINDINGS
  ) {
    throw new Error('Cannot use TURBOPACK_BINARY and TURBOPACK_BINDINGS both')
  }

  return (
    !!__INTERNAL_CUSTOM_TURBOPACK_BINARY ||
    !!__INTERNAL_CUSTOM_TURBOPACK_BINDINGS
  )
}

function checkVersionMismatch(pkgData: any) {
  const version = pkgData.version

  if (version && version !== nextVersion) {
    Log.warn(
      `Mismatching @next/swc version, detected: ${version} while Next.js is on ${nextVersion}. Please ensure these match`
    )
  }
}

// These are the platforms we'll try to load wasm bindings first,
// only try to load native bindings if loading wasm binding somehow fails.
// Fallback to native binding is for migration period only,
// once we can verify loading-wasm-first won't cause visible regressions,
// we'll not include native bindings for these platform at all.
const knownDefaultWasmFallbackTriples = [
  'aarch64-linux-android',
  'x86_64-unknown-freebsd',
  'aarch64-pc-windows-msvc',
  'arm-linux-androideabi',
  'armv7-unknown-linux-gnueabihf',
  'i686-pc-windows-msvc',
]

let wasmBindings: any
let downloadWasmPromise: any
let pendingBindings: any
let swcTraceFlushGuard: any
let swcCrashReporterFlushGuard: any
export const lockfilePatchPromise: { cur?: Promise<void> } = {}

export async function loadBindings(): Promise<any> {
  if (pendingBindings) {
    return pendingBindings
  }
  const isCustomTurbopack = await __isCustomTurbopackBinary()
  pendingBindings = new Promise(async (resolve, _reject) => {
    if (!lockfilePatchPromise.cur) {
      // always run lockfile check once so that it gets patched
      // even if it doesn't fail to load locally
      lockfilePatchPromise.cur = patchIncorrectLockfile(process.cwd()).catch(
        console.error
      )
    }

    let attempts: any[] = []
    const shouldLoadWasmFallbackFirst = triples.some(
      (triple: any) =>
        !!triple?.raw && knownDefaultWasmFallbackTriples.includes(triple.raw)
    )

    if (shouldLoadWasmFallbackFirst) {
      const fallbackBindings = await tryLoadWasmWithFallback(attempts)
      if (fallbackBindings) {
        return resolve(fallbackBindings)
      }
    }

    try {
      return resolve(loadNative(isCustomTurbopack))
    } catch (a) {
      attempts = attempts.concat(a)
    }

    // For these platforms we already tried to load wasm and failed, skip reattempt
    if (!shouldLoadWasmFallbackFirst) {
      const fallbackBindings = await tryLoadWasmWithFallback(attempts)
      if (fallbackBindings) {
        return resolve(fallbackBindings)
      }
    }

    logLoadFailure(attempts, true)
  })
  return pendingBindings
}

async function tryLoadWasmWithFallback(attempts: any) {
  try {
    let bindings = await loadWasm()
    // @ts-expect-error TODO: this event has a wrong type.
    eventSwcLoadFailure({ wasm: 'enabled' })
    return bindings
  } catch (a) {
    attempts = attempts.concat(a)
  }

  try {
    // if not installed already download wasm package on-demand
    // we download to a custom directory instead of to node_modules
    // as node_module import attempts are cached and can't be re-attempted
    // x-ref: https://github.com/nodejs/modules/issues/307
    const wasmDirectory = path.join(
      path.dirname(require.resolve('next/package.json')),
      'wasm'
    )
    if (!downloadWasmPromise) {
      downloadWasmPromise = downloadWasmNextRs(nextVersion, wasmDirectory)
    }
    await downloadWasmPromise
    let bindings = await loadWasm(pathToFileURL(wasmDirectory).href)
    // @ts-expect-error TODO: this event has a wrong type.
    eventSwcLoadFailure({ wasm: 'fallback' })

    // still log native load attempts so user is
    // aware it failed and should be fixed
    for (const attempt of attempts) {
      Log.warn(attempt)
    }
    return bindings
  } catch (a) {
    attempts = attempts.concat(a)
  }
}

function loadBindingsSync() {
  let attempts: any[] = []
  try {
    return loadNative()
  } catch (a) {
    attempts = attempts.concat(a)
  }

  // we can leverage the wasm bindings if they are already
  // loaded
  if (wasmBindings) {
    return wasmBindings
  }

  logLoadFailure(attempts)
}

let loggingLoadFailure = false

function logLoadFailure(attempts: any, triedWasm = false) {
  // make sure we only emit the event and log the failure once
  if (loggingLoadFailure) return
  loggingLoadFailure = true

  for (let attempt of attempts) {
    Log.warn(attempt)
  }

  // @ts-expect-error TODO: this event has a wrong type.
  eventSwcLoadFailure({ wasm: triedWasm ? 'failed' : undefined })
    .then(() => lockfilePatchPromise.cur || Promise.resolve())
    .finally(() => {
      Log.error(
        `Failed to load SWC binary for ${PlatformName}/${ArchName}, see more info here: https://nextjs.org/docs/messages/failed-loading-swc`
      )
      process.exit(1)
    })
}

export async function isWasm(): Promise<boolean> {
  let bindings = await loadBindings()
  return bindings.isWasm
}

export async function transform(src: string, options?: any): Promise<any> {
  let bindings = await loadBindings()
  return bindings.transform(src, options)
}

export function transformSync(src: string, options?: any): any {
  let bindings = loadBindingsSync()
  return bindings.transformSync(src, options)
}

export async function minify(src: string, options: any): Promise<string> {
  let bindings = await loadBindings()
  return bindings.minify(src, options)
}

export function minifySync(src: string, options: any): string {
  let bindings = loadBindingsSync()
  return bindings.minifySync(src, options)
}

export async function parse(src: string, options: any): Promise<any> {
  let bindings = await loadBindings()
  let parserOptions = getParserOptions(options)
  return bindings
    .parse(src, parserOptions)
    .then((astStr: any) => JSON.parse(astStr))
}

export function getBinaryMetadata() {
  let bindings
  try {
    bindings = loadNative()
  } catch (e) {
    // Suppress exceptions, this fn allows to fail to load native bindings
  }

  return {
    target: bindings?.getTargetTriple?.(),
  }
}

/**
 * Initialize trace subscriber to emit traces.
 *
 */
export const initCustomTraceSubscriber = (traceFileName?: string): void => {
  if (!swcTraceFlushGuard) {
    // Wasm binary doesn't support trace emission
    let bindings = loadNative()
    swcTraceFlushGuard = bindings.initCustomTraceSubscriber(traceFileName)
  }
}

/**
 * Teardown swc's trace subscriber if there's an initialized flush guard exists.
 *
 * This is workaround to amend behavior with process.exit
 * (https://github.com/vercel/next.js/blob/4db8c49cc31e4fc182391fae6903fb5ef4e8c66e/packages/next/bin/next.ts#L134=)
 * seems preventing napi's cleanup hook execution (https://github.com/swc-project/swc/blob/main/crates/node/src/util.rs#L48-L51=),
 *
 * instead parent process manually drops guard when process gets signal to exit.
 */
export const teardownTraceSubscriber = (() => {
  let flushed = false
  return (): void => {
    if (!flushed) {
      flushed = true
      try {
        let bindings = loadNative()
        if (swcTraceFlushGuard) {
          bindings.teardownTraceSubscriber(swcTraceFlushGuard)
        }
      } catch (e) {
        // Suppress exceptions, this fn allows to fail to load native bindings
      }
    }
  }
})()

export const teardownCrashReporter = (() => {
  let flushed = false
  return (): void => {
    if (!flushed) {
      flushed = true
      try {
        let bindings = loadNative()
        if (swcCrashReporterFlushGuard) {
          bindings.teardownCrashReporter(swcCrashReporterFlushGuard)
        }
      } catch (e) {
        // Suppress exceptions, this fn allows to fail to load native bindings
      }
    }
  }
})()
