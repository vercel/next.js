module.exports = {
  webpack(config) {
    config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm';

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true
    }

    return config
  },
}
