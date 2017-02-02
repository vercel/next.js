const webpack = require('webpack')
const notifier = require('node-notifier')
const childProcess = require('child_process')
const webpackConfig = require('./webpack.config')
const isWindows = /^win/.test(process.platform)

exports.compile = function * (fly) {
  yield fly.parallel(['compile-bin', 'compile-server', 'compile-lib', 'compile-client'])
  yield fly.start('remove-strict-mode')
}

exports['compile-bin'] = function * (fly, opts) {
  yield fly.source(opts.src || 'bin/*').babel().target('dist/bin')
  notify('Compiled binaries')
}

exports['compile-lib'] = function * (fly, opts) {
  yield fly.source(opts.src || 'lib/**/*.js').babel().target('dist/lib')
  notify('Compiled lib files')
}

exports['compile-server'] = function * (fly, opts) {
  yield fly.source(opts.src || 'server/**/*.js').babel().target('dist/server')
  notify('Compiled server files')
}

exports['compile-client'] = function * (fly, opts) {
  yield fly.source(opts.src || 'client/**/*.js').babel().target('dist/client')
  notify('Compiled client files')
}

exports['compile-bench'] = function * (fly, opts) {
  yield fly.source(opts.src || 'bench/*.js').babel().target('dist/bench')
  notify('Compiled bench files')
}

exports['remove-strict-mode'] = function * (fly) {
  yield fly.source('dist/lib/eval-script.js').babel({
    babelrc: false,
    plugins: ['babel-plugin-transform-remove-strict-mode']
  }).target('dist/lib')
  notify('Completed removing strict mode for eval script')
}

exports.copy = function * (fly) {
  yield fly.source('pages/**/*.js').target('dist/pages')
}

exports['copy-bench-fixtures'] = function * (fly) {
  yield fly.source('bench/fixtures/**/*').target('dist/bench/fixtures')
}

exports.build = function * (fly) {
  yield fly.parallel(['copy', 'compile']).start('build-prefetcher')
  // yield fly.serial(['copy', 'compile', 'build-prefetcher'])
}

exports['build-prefetcher'] = function * (fly) {
  webpack(webpackConfig)
  notify('Built release prefetcher')
}

exports.bench = function * (fly) {
  yield fly.parallel(['compile', 'compile-bench', 'copy', 'copy-bench-fixtures'])
  // yield fly.source('dist/bench/*.js').benchmark({
    // benchmark.reporters.etalon('RegExp#test')
  // })
}

exports.default = function * (fly) {
  yield fly.start('build')
  yield fly.watch('bin/*', 'compile-bin')
  yield fly.watch('pages/**/*.js', 'copy')
  yield fly.watch('server/**/*.js', 'compile-server')
  yield fly.watch('client/**/*.js', ['compile-client', 'build-prefetcher'])
  yield fly.watch('lib/**/*.js', ['compile-lib', 'build-prefetcher'])
}

exports.release = function * (fly) {
  yield fly.clear('dist').start('build')
}

// We run following task inside a NPM script chain and it runs chromedriver
// inside a child process tree.
// Even though we kill this task's process, chromedriver exists throughout
// the lifetime of the original npm script.

exports['start-chromedriver'] = function * (fly) {
  const processName =  isWindows ? 'chromedriver.cmd' : 'chromedriver'
  const chromedriver = childProcess.spawn(processName, { stdio: 'inherit' })
  // We need to do this, otherwise this task's process will keep waiting.
  setTimeout(() => process.exit(0), 2000)
}

exports['stop-chromedriver'] = function * (fly) {
  try {
    const cmd = isWindows ? 'taskkill /im chromedriver* /t /f' : 'pkill chromedriver'
    childProcess.execSync(cmd, { stdio: 'ignore' })
  } catch(err) {
    // Do nothing
  }
}

// notification helper
function notify (msg) {
  return notifier.notify({
    title: '▲ Next',
    message: msg,
    icon: false
  })
}
