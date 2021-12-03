import { platform, arch } from 'os'
import { platformArchTriples } from '@napi-rs/triples'
import * as Log from '../output/log'

const ArchName = arch()
const PlatformName = platform()
const triples = platformArchTriples[PlatformName][ArchName] || []

async function loadBindings() {
  return (await loadWasm()) || loadNative()
}

async function loadWasm() {
  // Try to load wasm bindings
  for (let specifier of ['@next/swc-wasm-web', '@next/swc-wasm-nodejs']) {
    try {
      let bindings = await import(specifier)
      if (specifier === '@next/swc-wasm-web') {
        bindings = await bindings.default()
      }
      return {
        isWasm: true,
        transform(src, options) {
          return Promise.resolve(
            bindings.transformSync(src.toString(), options)
          )
        },
        minify(src, options) {
          return Promise.resolve(bindings.minifySync(src.toString(), options))
        },
      }
    } catch (e) {}
  }
}

function loadNative() {
  let bindings
  let loadError

  for (const triple of triples) {
    try {
      bindings = require(`@next/swc/native/next-swc.${triple.platformArchABI}.node`)
      Log.info('Using locally built binary of @next/swc')
      break
    } catch (e) {
      if (e?.code !== 'MODULE_NOT_FOUND') {
        loadError = e
      }
    }
  }

  if (!bindings) {
    for (const triple of triples) {
      try {
        bindings = require(`@next/swc-${triple.platformArchABI}`)
        break
      } catch (e) {
        if (e?.code !== 'MODULE_NOT_FOUND') {
          loadError = e
        }
      }
    }
  }

  if (bindings) {
    return {
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
    }
  }

  if (loadError) {
    console.error(loadError)
  }

  Log.error(
    `Failed to load SWC binary, see more info here: https://nextjs.org/docs/messages/failed-loading-swc`
  )
  process.exit(1)
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
  let bindings = loadNative()
  return bindings.transformSync(src, options)
}

export async function minify(src, options) {
  let bindings = await loadBindings()
  return bindings.minify(src, options)
}

export function minifySync(src, options) {
  let bindings = loadNative()
  return bindings.minifySync(src, options)
}

export async function bundle(options) {
  let bindings = loadNative()
  return bindings.bundle(toBuffer(options))
}
