const { loadBinding } = require('@node-rs/helper')
const path = require('path')

/**
 * __dirname means load native addon from current dir
 * 'next-swc' is the name of native addon
 * the second arguments was decided by `napi.name` field in `package.json`
 * the third arguments was decided by `name` field in `package.json`
 * `loadBinding` helper will load `next-swc.[PLATFORM].node` from `__dirname` first
 * If failed to load addon, it will fallback to load from `next-swc-[PLATFORM]`
 */
const bindings = loadBinding(
  path.join(__dirname, '../../../native'),
  'next-swc',
  '@next/swc'
)

async function transform(src, options) {
  const isModule = typeof src !== 'string'
  options = options || {}

  if (options?.jsc?.parser) {
    options.jsc.parser.syntax = options.jsc.parser.syntax ?? 'ecmascript'
  }

  const { plugin, plugins, ...newOptions } = options
  let newPlugin

  if (plugin) {
    newPlugin = plugin
  } else if (plugins) {
    newPlugin = composePlugins(plugins)
  }

  if (newPlugin) {
    const m =
      typeof src === 'string'
        ? await parse(src, options?.jsc?.parser, options.filename)
        : src
    return transform(newPlugin(m), newOptions)
  }

  return bindings.transform(
    isModule ? JSON.stringify(src) : src,
    isModule,
    toBuffer(newOptions)
  )
}

function transformSync(src, options) {
  const isModule = typeof src !== 'string'
  options = options || {}

  if (options?.jsc?.parser) {
    options.jsc.parser.syntax = options.jsc.parser.syntax ?? 'ecmascript'
  }

  const { plugin, plugins, ...newOptions } = options
  let newPlugin

  if (plugin) {
    newPlugin = plugin
  } else if (plugins) {
    newPlugin = composePlugins(plugins)
  }

  if (newPlugin) {
    const m =
      typeof src === 'string'
        ? parseSync(src, options?.jsc?.parser, options.filename)
        : src
    return transformSync(newPlugin(m), newOptions)
  }

  return bindings.transformSync(
    isModule ? JSON.stringify(src) : src,
    isModule,
    toBuffer(newOptions)
  )
}

function toBuffer(t) {
  return Buffer.from(JSON.stringify(t))
}

export async function minify(src, opts) {
  return bindings.minify(toBuffer(src), toBuffer(opts ?? {}))
}

export function minifySync(src, opts) {
  return bindings.minifySync(toBuffer(src), toBuffer(opts ?? {}))
}

export async function parse(src, options, filename) {
  options = options || { syntax: 'ecmascript' }
  options.syntax = options.syntax || 'ecmascript'

  const res = await bindings.parse(src, toBuffer(options), filename)
  return JSON.parse(res)
}

export function parseSync(src, options, filename) {
  options = options || { syntax: 'ecmascript' }
  options.syntax = options.syntax || 'ecmascript'

  return JSON.parse(bindings.parseSync(src, toBuffer(options), filename))
}

function composePlugins(ps) {
  return (mod) => {
    let m = mod
    for (const p of ps) {
      m = p(m)
    }
    return m
  }
}

module.exports.transform = transform
module.exports.transformSync = transformSync
module.exports.minify = minify
module.exports.minifySync = minifySync
module.exports.parse = parse
module.exports.parseSync = parseSync
