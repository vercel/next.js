const fs = require('fs')
const { platform, arch } = require('os')
const path = require('path')
const { platformArchTriples } = require('@napi-rs/triples')
const Log = require('../output/log')

const ArchName = arch()
const PlatformName = platform()

let bindings = loadBindings()
let isWasm = false

function loadBindings() {
  let loadError

  // Try to load wasm bindings
  for (let specifier of ['@next/swc-wasm-web', '@next/swc-wasm-nodejs']) {
    try {
      bindings = require(specifier)
      isWasm = true
      return bindings
    } catch (e) {
      if (e?.code !== 'MODULE_NOT_FOUND') {
        loadError = e
      }
    }
  }

  // Try to load native bindings
  const triples = platformArchTriples[PlatformName][ArchName]
  for (const triple of triples) {
    const localFilePath = path.join(
      __dirname,
      '../../../../next-swc/native',
      `next-swc.${triple.platformArchABI}.node`
    )
    if (fs.existsSync(localFilePath)) {
      Log.info('Using locally built binary of next-swc')
      try {
        return require(localFilePath)
      } catch (e) {
        loadError = e
      }
    }

    try {
      return require(`@next/swc-${triple.platformArchABI}`)
    } catch (e) {
      if (e?.code !== 'MODULE_NOT_FOUND') {
        loadError = e
      }
    }

    // PR stats location/isolated tests location
    try {
      Log.info('Using locally built binary of @next/swc')
      return require(`@next/swc/native/next-swc.${triple.platformArchABI}.node`)
    } catch (e) {
      if (e?.code !== 'MODULE_NOT_FOUND') {
        loadError = e
      }
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

async function transform(src, options) {
  const isModule = typeof src !== 'string' && !Buffer.isBuffer(src)
  options = options || {}

  if (options?.jsc?.parser) {
    options.jsc.parser.syntax = options.jsc.parser.syntax ?? 'ecmascript'
  }

  const result = bindings.transform(
    isModule ? JSON.stringify(src) : src,
    isModule,
    toBuffer(options)
  )
  return isWasm ? Promise.resolve(result) : result
}

function transformSync(src, options) {
  const isModule = typeof src !== 'string' && !Buffer.isBuffer(src)
  options = options || {}

  if (options?.jsc?.parser) {
    options.jsc.parser.syntax = options.jsc.parser.syntax ?? 'ecmascript'
  }

  return bindings.transformSync(
    isModule ? JSON.stringify(src) : src,
    isModule,
    toBuffer(options)
  )
}

function toBuffer(t) {
  return Buffer.from(JSON.stringify(t))
}

export async function minify(src, opts) {
  const result = bindings.minify(toBuffer(src), toBuffer(opts ?? {}))
  return isWasm ? Promise.resolve(result) : result
}

export function minifySync(src, opts) {
  return bindings.minifySync(toBuffer(src), toBuffer(opts ?? {}))
}

export async function bundle(options) {
  if (isWasm) {
    Log.error(`SWC bundle() method is not supported in wasm environments yet.`)
    process.exit(1)
  }
  return bindings.bundle(toBuffer(options))
}

module.exports.transform = transform
module.exports.transformSync = transformSync
module.exports.minify = minify
module.exports.minifySync = minifySync
