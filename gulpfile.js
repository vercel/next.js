const fs = require('fs')
const gulp = require('gulp')
const babel = require('gulp-babel')
const cache = require('gulp-cached')
const notify_ = require('gulp-notify')
const benchmark = require('gulp-benchmark')
const sequence = require('run-sequence')
const webpack = require('webpack')
const webpackStream = require('webpack-stream')
const del = require('del')
const childProcess = require('child_process')

const isWindows = /^win/.test(process.platform)
const babelOptions = JSON.parse(fs.readFileSync('.babelrc', 'utf-8'))

gulp.task('compile', [
  'compile-bin',
  'compile-lib',
  'compile-server',
  'compile-client',
  'remove-strict-mode'
])

gulp.task('compile-bin', () => {
  return gulp.src('bin/*')
  .pipe(cache('bin'))
  .pipe(babel(babelOptions))
  .pipe(gulp.dest('dist/bin'))
  .pipe(notify('Compiled binaries'))
})

gulp.task('compile-lib', () => {
  return gulp.src('lib/**/*.js')
  .pipe(cache('lib'))
  .pipe(babel(babelOptions))
  .pipe(gulp.dest('dist/lib'))
  .pipe(notify('Compiled lib files'))
})

gulp.task('compile-server', () => {
  return gulp.src('server/**/*.js')
  .pipe(cache('server'))
  .pipe(babel(babelOptions))
  .pipe(gulp.dest('dist/server'))
  .pipe(notify('Compiled server files'))
})

gulp.task('compile-client', () => {
  return gulp.src('client/**/*.js')
  .pipe(cache('client'))
  .pipe(babel(babelOptions))
  .pipe(gulp.dest('dist/client'))
  .pipe(notify('Compiled client files'))
})

gulp.task('remove-strict-mode', ['compile-lib'], () => {
  return gulp.src('dist/lib/eval-script.js')
  .pipe(babel({
    babelrc: false,
    plugins: ['babel-plugin-transform-remove-strict-mode']
  }))
  .pipe(gulp.dest('dist/lib'))
  .pipe(notify('Completed removing strict mode for eval script'))
})

gulp.task('copy', ['copy-pages'])

gulp.task('copy-pages', () => {
  return gulp.src('pages/**/*.js')
  .pipe(gulp.dest('dist/pages'))
})

gulp.task('compile-bench', () => {
  return gulp.src('bench/*.js')
  .pipe(cache('bench'))
  .pipe(babel(babelOptions))
  .pipe(gulp.dest('dist/bench'))
  .pipe(notify('Compiled bench files'))
})

gulp.task('copy-bench-fixtures', () => {
  return gulp.src('bench/fixtures/**/*')
  .pipe(gulp.dest('dist/bench/fixtures'))
})

gulp.task('build', [
  'build-prefetcher'
])

gulp.task('build-prefetcher', ['compile-lib', 'compile-client'], () => {
  return gulp
  .src('client/next-prefetcher.js')
  .pipe(webpackStream({
    output: { filename: 'next-prefetcher-bundle.js' },
    plugins: [
      new webpack.DefinePlugin({
        'process.env': {
          NODE_ENV: JSON.stringify('production')
        }
      })
    ],
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          loader: 'babel-loader',
          options: {
            babelrc: false,
            presets: [
              ['env', {
                targets: {
                  // All browsers which supports service workers
                  browsers: ['chrome 49', 'firefox 49', 'opera 41']
                }
              }]
            ]
          }
        }
      ]
    }
  }, webpack))
  .pipe(gulp.dest('dist/client'))
  .pipe(notify('Built release prefetcher'))
})

gulp.task('bench', ['compile', 'copy', 'compile-bench', 'copy-bench-fixtures'], () => {
  return gulp.src('dist/bench/*.js', {read: false})
  .pipe(benchmark({
    reporters: benchmark.reporters.etalon('RegExp#test')
  }))
})

gulp.task('watch', [
  'watch-bin',
  'watch-lib',
  'watch-server',
  'watch-client',
  'watch-pages'
])

gulp.task('watch-bin', () => {
  return gulp.watch('bin/*', [
    'compile-bin'
  ])
})

gulp.task('watch-lib', () => {
  return gulp.watch('lib/**/*.js', [
    'compile-lib',
    'build'
  ])
})

gulp.task('watch-server', () => {
  return gulp.watch('server/**/*.js', [
    'compile-server'
  ])
})

gulp.task('watch-client', () => {
  return gulp.watch('client/**/*.js', [
    'compile-client',
    'build'
  ])
})

gulp.task('watch-pages', () => {
  return gulp.watch('pages/**/*.js', [
    'copy-pages'
  ])
})

gulp.task('clean', () => {
  return del('dist')
})

gulp.task('default', [
  'compile',
  'build',
  'copy',
  'watch'
])

gulp.task('release', (cb) => {
  sequence('clean', [
    'compile',
    'build',
    'copy',
  ], cb)
})

// We run following task inside a NPM script chain and it runs chromedriver
// inside a child process tree.
// Even though we kill this task's process, chromedriver exists throughout
// the lifetime of the original npm script.

gulp.task('start-chromedriver', ['stop-chromedriver'], (cb) => {
  const processName =  isWindows? 'chromedriver.cmd' : 'chromedriver'
  const chromedriver = childProcess.spawn(processName, { stdio: 'inherit' })

  const timeoutHandler = setTimeout(() => {
    // We need to do this, otherwise this task's process will keep waiting.
    process.exit(0)
  }, 2000)
})

gulp.task('stop-chromedriver', () => {
  try {
    if (isWindows) {
      childProcess.execSync('taskkill /im chromedriver* /t /f', { stdio: 'ignore' })
    } else {
      childProcess.execSync('pkill chromedriver', { stdio: 'ignore' })
    }
  } catch(ex) {
    // Do nothing
  }
})

// avoid logging to the console
// that we created a notification
notify_.logLevel(0)

// notification helper
function notify (msg) {
  return notify_({
    title: '▲ Next',
    message: msg,
    icon: false,
    onLast: true
  })
}
