module.exports = {
  'presets': [require('../../babel.config.js')],
  'plugins': [
    ['babel-plugin-transform-define', {
      'process.env.NEXT_VERSION': require('./package.json').version
    }]
  ]
}
