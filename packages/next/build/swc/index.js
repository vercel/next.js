import path from 'path'
import { pathToFileURL } from 'url'
import { platform, arch } from 'os'
import { platformArchTriples } from 'next/dist/compiled/@napi-rs/triples'
import * as Log from '../output/log'
import { getParserOptions } from './options'
import { eventSwcLoadFailure } from '../../telemetry/events/swc-load-failure'
import { patchIncorrectLockfile } from '../../lib/patch-incorrect-lockfile'
import { downloadWasmSwc } from '../../lib/download-wasm-swc'
import { version as nextVersion } from 'next/package.json'

const ArchName = arch()
const PlatformName = platform()
const triples = platformArchTriples[PlatformName][ArchName] || []

// Allow to specify an absolute path to the custom turbopack binary to load.
// If one of env variables is set, `loadNative` will try to use any turbo-* interfaces from specified
// binary instead. This will not affect existing swc's transform, or other interfaces. This is thin,
// naive interface - `loadBindings` will not validate neither path nor the binary.
//
// Note these are internal flag: there's no stability, feature gaurentee.
const __INTERNAL_CUSTOM_TURBOPACK_BINARY =
  process.env.__INTERNAL_CUSTOM_TURBOPACK_BINARY
const __INTERNAL_CUSTOM_TURBOPACK_BINDINGS =
  process.env.__INTERNAL_CUSTOM_TURBOPACK_BINDINGS
export const __isCustomTurbopackBinary = async () => {
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

let nativeBindings
let wasmBindings
let downloadWasmPromise
let pendingBindings
let swcTraceFlushGuard
let swcCrashReporterFlushGuard
export const lockfilePatchPromise = {}

export async function loadBindings() {
  if (pendingBindings) {
    return pendingBindings
  }
  const isCustomTurbopack = await __isCustomTurbopackBinary()
  pendingBindings = new Promise(async (resolve, reject) => {
    if (!lockfilePatchPromise.cur) {
      // always run lockfile check once so that it gets patched
      // even if it doesn't fail to load locally
      lockfilePatchPromise.cur = patchIncorrectLockfile(process.cwd()).catch(
        console.error
      )
    }

    let attempts = []
    const shouldLoadWasmFallbackFirst = triples.some(
      (triple) =>
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

async function tryLoadWasmWithFallback(attempts) {
  try {
    let bindings = await loadWasm()
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
      downloadWasmPromise = downloadWasmSwc(nextVersion, wasmDirectory)
    }
    await downloadWasmPromise
    let bindings = await loadWasm(pathToFileURL(wasmDirectory).href)
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
  let attempts = []
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

function logLoadFailure(attempts, triedWasm = false) {
  // make sure we only emit the event and log the failure once
  if (loggingLoadFailure) return
  loggingLoadFailure = true

  for (let attempt of attempts) {
    Log.warn(attempt)
  }

  eventSwcLoadFailure({ wasm: triedWasm ? 'failed' : undefined })
    .then(() => lockfilePatchPromise.cur || Promise.resolve())
    .finally(() => {
      Log.error(
        `Failed to load SWC binary for ${PlatformName}/${ArchName}, see more info here: https://nextjs.org/docs/messages/failed-loading-swc`
      )
      process.exit(1)
    })
}

async function loadWasm(importPath = '') {
  if (wasmBindings) {
    return wasmBindings
  }

  let attempts = []
  for (let pkg of ['@next/swc-wasm-nodejs', '@next/swc-wasm-web']) {
    try {
      let pkgPath = pkg

      if (importPath) {
        // the import path must be exact when not in node_modules
        pkgPath = path.join(importPath, pkg, 'wasm.js')
      }
      let bindings = await import(pkgPath)
      if (pkg === '@next/swc-wasm-web') {
        bindings = await bindings.default()
      }
      Log.info('Using wasm build of next-swc')

      // Note wasm binary does not support async intefaces yet, all async
      // interface coereces to sync interfaces.
      wasmBindings = {
        isWasm: true,
        transform(src, options) {
          // TODO: we can remove fallback to sync interface once new stable version of next-swc gets published (current v12.2)
          return bindings?.transform
            ? bindings.transform(src.toString(), options)
            : Promise.resolve(bindings.transformSync(src.toString(), options))
        },
        transformSync(src, options) {
          return bindings.transformSync(src.toString(), options)
        },
        minify(src, options) {
          return bindings?.minify
            ? bindings.minify(src.toString(), options)
            : Promise.resolve(bindings.minifySync(src.toString(), options))
        },
        minifySync(src, options) {
          return bindings.minifySync(src.toString(), options)
        },
        parse(src, options) {
          return bindings?.parse
            ? bindings.parse(src.toString(), options)
            : Promise.resolve(bindings.parseSync(src.toString(), options))
        },
        parseSync(src, options) {
          const astStr = bindings.parseSync(src.toString(), options)
          return astStr
        },
        getTargetTriple() {
          return undefined
        },
        turbo: {
          startDev: () => {
            Log.error('Wasm binding does not support --turbo yet')
          },
          startTrace: () => {
            Log.error('Wasm binding does not support trace yet')
          },
        },
        mdx: {
          compile: (src, options) => bindings.mdxCompile(src, options),
          compileSync: (src, options) => bindings.mdxCompileSync(src, options),
        },
      }
      return wasmBindings
    } catch (e) {
      // Only log attempts for loading wasm when loading as fallback
      if (importPath) {
        if (e?.code === 'ERR_MODULE_NOT_FOUND') {
          attempts.push(`Attempted to load ${pkg}, but it was not installed`)
        } else {
          attempts.push(
            `Attempted to load ${pkg}, but an error occurred: ${e.message ?? e}`
          )
        }
      }
    }
  }

  throw attempts
}

function loadNative(isCustomTurbopack = false) {
  if (nativeBindings) {
    return nativeBindings
  }

  let bindings
  let attempts = []

  for (const triple of triples) {
    try {
      bindings = require(`@next/swc/native/next-swc.${triple.platformArchABI}.node`)
      Log.info('Using locally built binary of @next/swc')
      break
    } catch (e) {}
  }

  if (!bindings) {
    for (const triple of triples) {
      let pkg = `@next/swc-${triple.platformArchABI}`
      try {
        bindings = require(pkg)
        break
      } catch (e) {
        if (e?.code === 'MODULE_NOT_FOUND') {
          attempts.push(`Attempted to load ${pkg}, but it was not installed`)
        } else {
          attempts.push(
            `Attempted to load ${pkg}, but an error occurred: ${e.message ?? e}`
          )
        }
      }
    }
  }

  if (bindings) {
    // Initialize crash reporter, as earliest as possible from any point of import.
    // The first-time import to next-swc is not predicatble in the import tree of next.js, which makes
    // we can't rely on explicit manual initialization as similar to trace reporter.
    if (!swcCrashReporterFlushGuard) {
      // Crash reports in next-swc should be treated in the same way we treat telemetry to opt out.
      /* TODO: temporarily disable initialization while confirming logistics.
      let telemetry = new Telemetry({ distDir: process.cwd() })
      if (telemetry.isEnabled) {
        swcCrashReporterFlushGuard = bindings.initCrashReporter?.()
      }*/
    }

    nativeBindings = {
      isWasm: false,
      transform(src, options) {
        const isModule =
          typeof src !== undefined &&
          typeof src !== 'string' &&
          !Buffer.isBuffer(src)
        options = options || {}

        if (options?.jsc?.parser) {
          options.jsc.parser.syntax = options.jsc.parser.syntax ?? 'ecmascript'
        }

        return bindings.transform(
          isModule ? JSON.stringify(src) : src,
          isModule,
          toBuffer(options)
        )
      },

      transformSync(src, options) {
        if (typeof src === undefined) {
          throw new Error(
            "transformSync doesn't implement reading the file from filesystem"
          )
        } else if (Buffer.isBuffer(src)) {
          throw new Error(
            "transformSync doesn't implement taking the source code as Buffer"
          )
        }
        const isModule = typeof src !== 'string'
        options = options || {}

        if (options?.jsc?.parser) {
          options.jsc.parser.syntax = options.jsc.parser.syntax ?? 'ecmascript'
        }

        return bindings.transformSync(
          isModule ? JSON.stringify(src) : src,
          isModule,
          toBuffer(options)
        )
      },

      minify(src, options) {
        return bindings.minify(toBuffer(src), toBuffer(options ?? {}))
      },

      minifySync(src, options) {
        return bindings.minifySync(toBuffer(src), toBuffer(options ?? {}))
      },

      parse(src, options) {
        return bindings.parse(src, toBuffer(options ?? {}))
      },

      getTargetTriple: bindings.getTargetTriple,
      initCustomTraceSubscriber: bindings.initCustomTraceSubscriber,
      teardownTraceSubscriber: bindings.teardownTraceSubscriber,
      teardownCrashReporter: bindings.teardownCrashReporter,
      turbo: {
        startDev: (options) => {
          const devOptions = {
            ...options,
            noOpen: options.noOpen ?? true,
          }

          if (!isCustomTurbopack) {
            bindings.startTurboDev(toBuffer(devOptions))
          } else if (!!__INTERNAL_CUSTOM_TURBOPACK_BINARY) {
            console.warn(
              `Loading custom turbopack binary from ${__INTERNAL_CUSTOM_TURBOPACK_BINARY}`
            )

            return new Promise((resolve, reject) => {
              const spawn = require('next/dist/compiled/cross-spawn')
              const args = []

              Object.entries(devOptions).forEach(([key, value]) => {
                let cli_key = `--${key.replace(
                  /[A-Z]/g,
                  (m) => '-' + m.toLowerCase()
                )}`
                if (key === 'dir') {
                  args.push(value)
                } else if (typeof value === 'boolean' && value === true) {
                  args.push(cli_key)
                } else if (typeof value !== 'boolean' && !!value) {
                  args.push(cli_key, value)
                }
              })

              console.warn(`Running turbopack with args: [${args.join(' ')}]`)

              const child = spawn(__INTERNAL_CUSTOM_TURBOPACK_BINARY, args, {
                stdio: 'inherit',
                env: {
                  ...process.env,
                },
              })
              child.on('message', (message) => {
                console.log(message)
              })
              child.on('close', (code) => {
                if (code !== 0) {
                  reject({
                    command: `${__INTERNAL_CUSTOM_TURBOPACK_BINARY} ${args.join(
                      ' '
                    )}`,
                  })
                  return
                }
                resolve(0)
              })
            })
          } else if (!!__INTERNAL_CUSTOM_TURBOPACK_BINDINGS) {
            console.warn(
              `Loading custom turbopack bindings from ${__INTERNAL_CUSTOM_TURBOPACK_BINARY}`
            )
            console.warn(`Running turbopack with args: `, devOptions)

            require(__INTERNAL_CUSTOM_TURBOPACK_BINDINGS).startDev(devOptions)
          }
        },
        startTrace: (options = {}) =>
          bindings.runTurboTracing(toBuffer({ exact: true, ...options })),
      },
      mdx: {
        compile: (src, options) =>
          bindings.mdxCompile(src, toBuffer(options ?? {})),
        compileSync: (src, options) =>
          bindings.mdxCompileSync(src, toBuffer(options ?? {})),
      },
    }
    return nativeBindings
  }

  throw attempts
}

function toBuffer(t) {
  return Buffer.from(JSON.stringify(t))
}

export async function isWasm() {
  let bindings = await loadBindings()
  return bindings.isWasm
}

export async function transform(src, options) {
  let bindings = await loadBindings()
  return bindings.transform(src, options)
}

export function transformSync(src, options) {
  let bindings = loadBindingsSync()
  return bindings.transformSync(src, options)
}

export async function minify(src, options) {
  let bindings = await loadBindings()
  return bindings.minify(src, options)
}

export function minifySync(src, options) {
  let bindings = loadBindingsSync()
  return bindings.minifySync(src, options)
}

export async function parse(src, options) {
  let bindings = await loadBindings()
  let parserOptions = getParserOptions(options)
  return bindings.parse(src, parserOptions).then((astStr) => JSON.parse(astStr))
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
export const initCustomTraceSubscriber = (() => {
  return (filename) => {
    if (!swcTraceFlushGuard) {
      // Wasm binary doesn't support trace emission
      let bindings = loadNative()
      swcTraceFlushGuard = bindings.initCustomTraceSubscriber(filename)
    }
  }
})()

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
  return () => {
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
  return () => {
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
