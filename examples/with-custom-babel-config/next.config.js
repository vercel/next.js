// This file is not going through babel transformation.
// So, we write it in vanilla JS
// (But you could use ES2015 features supported by your Node.js version)

module.exports = {
  // config is the set of options we pass to our babel-loaders's query option
  babel: function (config) {
    // Add the stage-0 preset.
    // Make sure to use 'require.resolve' otherwise we won't be able to find it.
    config.presets.push(require.resolve('babel-preset-stage-0'))

    // Important: return the modified config
    return config
  }
}
