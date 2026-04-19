// Originated from https://github.com/Timer/cssnano-simple/blob/master/src/index.js

/**
 * This file is the actual "cssnano-simple" implementation, which will eventually be used
 * by "next/src/build/cssnano-simple"
 */

const createSimplePreset = require('./cssnano-preset-simple')

module.exports = (opts = {}, postcss = require('postcss')) => {
  const excludeAll = Boolean(opts && opts.excludeAll)

  const userOpts = Object.assign({}, opts)

  if (excludeAll) {
    for (const userOption in userOpts) {
      if (!userOpts.hasOwnProperty(userOption)) continue
      const val = userOpts[userOption]
      if (!Boolean(val)) {
        continue
      }

      if (Object.prototype.toString.call(val) === '[object Object]') {
        userOpts[userOption] = Object.assign({}, { exclude: false }, val)
      }
    }
  }

  const options = Object.assign(
    {},
    excludeAll ? { rawCache: true } : undefined,
    userOpts
  )

  const plugins = []
  createSimplePreset(options).plugins.forEach((plugin) => {
    if (Array.isArray(plugin)) {
      let [processor, pluginOpts] = plugin
      processor = processor.default || processor

      const isEnabled =
        // No options:
        (!excludeAll && typeof pluginOpts === 'undefined') ||
        // Short-hand enabled:
        (typeof pluginOpts === 'boolean' && pluginOpts) ||
        // Include all plugins:
        (!excludeAll &&
          pluginOpts &&
          typeof pluginOpts === 'object' &&
          !pluginOpts.exclude) ||
        // Exclude all plugins:
        (excludeAll &&
          pluginOpts &&
          typeof pluginOpts === 'object' &&
          pluginOpts.exclude === false)

      if (isEnabled) {
        plugins.push(processor(pluginOpts))
      }
    } else {
      plugins.push(plugin)
    }
  })

  return postcss(plugins)
}

module.exports.postcss = true
