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

let nativeBindings
let wasmBindings
let downloadWasmPromise
let pendingBindings
let swcTraceFlushGuard
export const lockfilePatchPromise = {}

export async function loadBindings() {
  if (pendingBindings) {
    return pendingBindings
  }
  pendingBindings = new Promise(async (resolve, reject) => {
    if (!lockfilePatchPromise.cur) {
      // always run lockfile check once so that it gets patched
      // even if it doesn't fail to load locally
      lockfilePatchPromise.cur = patchIncorrectLockfile(process.cwd()).catch(
        console.error
      )
    }

    let attempts = []
    try {
      return resolve(loadNative())
    } catch (a) {
      attempts = attempts.concat(a)
    }

    try {
      let bindings = await loadWasm()
      eventSwcLoadFailure({ wasm: 'enabled' })
      return resolve(bindings)
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
      return resolve(bindings)
    } catch (a) {
      attempts = attempts.concat(a)
    }

    logLoadFailure(attempts, true)
  })
  return pendingBindings
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
      Log.info('Using experimental wasm build of next-swc')
      wasmBindings = {
        isWasm: true,
        transform(src, options) {
          return bindings.transformSync(src.toString(), options)
        },
        transformSync(src, options) {
          return bindings.transformSync(src.toString(), options)
        },
        minify(src, options) {
          return bindings.minifySync(src.toString(), options)
        },
        minifySync(src, options) {
          return bindings.minifySync(src.toString(), options)
        },
        parse(src, options) {
          const astStr = bindings.parseSync(src.toString(), options)
          return astStr
        },
        parseSync(src, options) {
          const astStr = bindings.parseSync(src.toString(), options)
          return astStr
        },
        getTargetTriple() {
          return undefined
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

function loadNative() {
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

      bundle(options) {
        return bindings.bundle(toBuffer(options))
      },

      parse(src, options) {
        return bindings.parse(src, toBuffer(options ?? {}))
      },

      getTargetTriple: bindings.getTargetTriple,
      initCustomTraceSubscriber: bindings.initCustomTraceSubscriber,
      teardownTraceSubscriber: bindings.teardownTraceSubscriber,
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

export async function bundle(options) {
  let bindings = loadBindingsSync()
  return bindings.bundle(toBuffer(options))
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
