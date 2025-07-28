const npm = require('npm')
const install = require('npm/lib/install')
const rimraf = require('rimraf')

npm.load((err) => {
  if (err) {
    throw err
  }
  npm.config.set('audit', false)
  npm.config.set('package-lock', false)
  npm.config.set('progress', false)
  if (process.env.NPM_REGISTRY_URL) {
    npm.config.set('registry', process.env.NPM_REGISTRY_URL)
  }
  const args = [`lodash@4.1.17`]
  install('./asdf', args, () => {})
  rimraf.sync('./asdf')
})
