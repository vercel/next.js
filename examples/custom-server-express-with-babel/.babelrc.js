const buildPreset = targets => ['next/babel', { 'preset-env': { targets, modules: 'commonjs' } }]
module.exports = {
  presets: [buildPreset({ node: 'current' })],
  env: {
    client: {
      presets: [buildPreset({ chrome: 58, ie: 11 })]
    }
  }
}
