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

  const { plugin, ...newOptions } = options

  if (plugin) {
    const m =
      typeof src === 'string'
        ? await this.parse(src, options?.jsc?.parser)
        : src
    return this.transform(plugin(m), newOptions)
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

  const { plugin, ...newOptions } = options

  if (plugin) {
    const m =
      typeof src === 'string' ? this.parseSync(src, options?.jsc?.parser) : src
    return this.transformSync(plugin(m), newOptions)
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

module.exports.transform = transform
module.exports.transformSync = transformSync
