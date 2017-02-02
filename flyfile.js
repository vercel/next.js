const webpack = require('webpack')
const { resolve } = require('path')
const notifier = require('node-notifier')
const childProcess = require('child_process')
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
  // yield fly.parallel(['copy', 'compile']).start('build-prefetcher')
  yield fly.serial(['copy', 'compile', 'build-prefetcher'])
}

exports['build-prefetcher'] = function * (fly) {
  yield Promise.resolve()
  // webpack({
  //   context: resolve(__dirname, 'client'),
  //   entry: './next-prefetcher.js',
  //   output: {
  //     filename: '[name]-bundle.js',
  //     path: resolve(__dirname, 'dist/client')
  //   },
  //   plugins: [
  //     new webpack.DefinePlugin({
  //       'process.env': {
  //         NODE_ENV: JSON.stringify('production')
  //       }
  //     })
  //   ],
  //   module: {
  //     rules: [{
  //       test: /\.js$/,
  //       exclude: /node_modules/,
  //       loader: 'babel-loader',
  //       options: {
  //         babelrc: false,
  //         presets: [
  //           ['env', {
  //             targets: {
  //               // All browsers which supports service workers
  //               browsers: ['chrome 49', 'firefox 49', 'opera 41']
  //             }
  //           }]
  //         ]
  //       }
  //     }]
  //   }
  // })
  notify('Built release prefetcher')
}

exports.bench = function * (fly) {
  console.log('inside bench');
  yield Promise.resolve()
// ['compile', 'copy', 'compile-bench', 'copy-bench-fixtures'], () => {
  // yield fly.source('dist/bench/*.js').benchmark({
    // benchmark.reporters.etalon('RegExp#test')
  // })
}

// exports.watch = function * (fly) {
// }

exports.default = function * (fly) {
  yield fly.watch('bin/*', 'compile-bin')
  yield fly.watch('pages/**/*.js', 'copy')
  yield fly.watch('server/**/*.js', 'compile-server')
  yield fly.watch('client/**/*.js', ['compile-client', 'build-prefetcher'])
  yield fly.watch('lib/**/*.js', ['compile-lib', 'build-prefetcher'])
  // yield fly.serial(['build', 'watch'])
  // yield fly.start('watch')
}

exports.release = function * (fly) {
  yield fly.clear('dist').start('build')
}

// We run following task inside a NPM script chain and it runs chromedriver
// inside a child process tree.
// Even though we kill this task's process, chromedriver exists throughout
// the lifetime of the original npm script.

// gulp.task('start-chromedriver', ['stop-chromedriver'], (cb) => {
//   const processName =  isWindows? 'chromedriver.cmd' : 'chromedriver'
//   const chromedriver = childProcess.spawn(processName, { stdio: 'inherit' })

//   const timeoutHandler = setTimeout(() => {
//     // We need to do this, otherwise this task's process will keep waiting.
//     process.exit(0)
//   }, 2000)
// })

// gulp.task('stop-chromedriver', () => {
//   try {
//     if (isWindows) {
//       childProcess.execSync('taskkill /im chromedriver* /t /f', { stdio: 'ignore' })
//     } else {
//       childProcess.execSync('pkill chromedriver', { stdio: 'ignore' })
//     }
//   } catch(ex) {
//     // Do nothing
//   }
// })

// notification helper
function notify (msg) {
  return notifier.notify({
    title: '▲ Next',
    message: msg,
    icon: false
  })
}
