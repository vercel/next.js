import { platform, arch } from 'os'
import { platformArchTriples } from 'next/dist/compiled/@napi-rs/triples'
import { version as nextVersion, optionalDependencies } from 'next/package.json'
import * as Log from '../output/log'
import { getParserOptions } from './options'
import { eventSwcLoadFailure } from '../../telemetry/events/swc-load-failure'
import { patchIncorrectLockfile } from '../../lib/patch-incorrect-lockfile'

const ArchName = arch()
const PlatformName = platform()
const triples = platformArchTriples[PlatformName][ArchName] || []

let nativeBindings
let wasmBindings
export const lockfilePatchPromise = {}

async function loadBindings() {
  if (!lockfilePatchPromise.cur) {
    // always run lockfile check once so that it gets patched
    // even if it doesn't fail to load locally
    lockfilePatchPromise.cur = patchIncorrectLockfile(process.cwd()).catch(
      console.error
    )
  }

  let attempts = []
  try {
    return loadNative()
  } catch (a) {
    attempts = attempts.concat(a)
  }

  // TODO: fetch wasm and fallback when loading native fails
  // so that users aren't blocked on this, we still want to
  // report the native load failure so we can patch though
  try {
    let bindings = await loadWasm()
    return bindings
  } catch (a) {
    attempts = attempts.concat(a)
  }

  logLoadFailure(attempts)
}

function loadBindingsSync() {
  let attempts = []
  try {
    return loadNative()
  } catch (a) {
    attempts = attempts.concat(a)
  }

  logLoadFailure(attempts)
}

let loggingLoadFailure = false

function logLoadFailure(attempts) {
  // make sure we only emit the event and log the failure once
  if (loggingLoadFailure) return
  loggingLoadFailure = true

  for (let attempt of attempts) {
    Log.warn(attempt)
  }
  let glibcVersion
  let installedSwcPackages

  try {
    glibcVersion = process.report?.getReport().header.glibcVersionRuntime
  } catch (_) {}

  try {
    const pkgNames = Object.keys(optionalDependencies || {}).filter((pkg) =>
      pkg.startsWith('@next/swc')
    )
    const installedPkgs = []

    for (const pkg of pkgNames) {
      try {
        const { version } = require(`${pkg}/package.json`)
        installedPkgs.push(`${pkg}@${version}`)
      } catch (_) {}
    }

    if (installedPkgs.length > 0) {
      installedSwcPackages = installedPkgs.sort().join(',')
    }
  } catch (_) {}

  eventSwcLoadFailure({
    nextVersion,
    glibcVersion,
    installedSwcPackages,
    arch: process.arch,
    platform: process.platform,
    nodeVersion: process.versions.node,
  })
    .then(() => lockfilePatchPromise.cur || Promise.resolve())
    .finally(() => {
      Log.error(
        `Failed to load SWC binary for ${PlatformName}/${ArchName}, see more info here: https://nextjs.org/docs/messages/failed-loading-swc`
      )
      process.exit(1)
    })
}

async function loadWasm() {
  if (wasmBindings) {
    return wasmBindings
  }

  let attempts = []
  for (let pkg of ['@next/swc-wasm-nodejs', '@next/swc-wasm-web']) {
    try {
      let bindings = await import(pkg)
      if (pkg === '@next/swc-wasm-web') {
        bindings = await bindings.default()
      }
      Log.info('Using experimental wasm build of next-swc')
      wasmBindings = {
        isWasm: true,
        transform(src, options) {
          return Promise.resolve(
            bindings.transformSync(src.toString(), options)
          )
        },
        minify(src, options) {
          return Promise.resolve(bindings.minifySync(src.toString(), options))
        },
        parse(src, options) {
          const astStr = bindings.parseSync(src.toString(), options)
          return Promise.resolve(astStr)
        },
        getTargetTriple() {
          return undefined
        },
      }
      return wasmBindings
    } catch (e) {
      // Do not report attempts to load wasm when it is still experimental
      // if (e?.code === 'ERR_MODULE_NOT_FOUND') {
      //   attempts.push(`Attempted to load ${pkg}, but it was not installed`)
      // } else {
      //   attempts.push(
      //     `Attempted to load ${pkg}, but an error occurred: ${e.message ?? e}`
      //   )
      // }
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
