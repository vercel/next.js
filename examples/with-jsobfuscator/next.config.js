const JavaScriptObfuscatorPlugin = require('webpack-obfuscator')
const { obfuscate } = require('javascript-obfuscator');
const { IS_BUNDLED_PAGE } = require('next/dist/server/utils')

class NextJSBundleObfuscatorPlugin {
  constructor (options) {
    this.options = options
  }

  apply (compiler) {
    compiler.plugin('after-compile', (compilation, callback) => {
      const pages = Object
        .keys(compilation.namedChunks)
        .map(key => compilation.namedChunks[key])
        .filter(chunk => IS_BUNDLED_PAGE.test(chunk.name))
      pages.forEach((chunk) => {
        const obfuscated = obfuscate(compilation.assets[chunk.name].source(), this.options).getObfuscatedCode()
        compilation.assets[chunk.name] = {
          source: () => obfuscated,
          size: () => obfuscated.length
        }
      })
      callback()
    })
  }
}

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.25,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.25,
  debugProtection: true,
  debugProtectionInterval: true,
  disableConsoleOutput: true,
  log: false,
  mangle: true,
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: 'rc4',
  stringArrayThreshold: 1,
  unicodeEscapeSequence: false
}

module.exports = {
  webpack: (config, { buildId, dev }) => {
    if (!dev) {
      config.plugins.push(new JavaScriptObfuscatorPlugin (obfuscatorOptions, ['bundles/**/**.js']))
      config.plugins.push(new NextJSBundleObfuscatorPlugin(obfuscatorOptions))
    }

    return config
  }
}