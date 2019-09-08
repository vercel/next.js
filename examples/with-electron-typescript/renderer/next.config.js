exports.webpack = config =>
  Object.assign(config, {
    target: 'electron-renderer'
  })
