const fs = require('fs')
const gulp = require('gulp')
const babel = require('gulp-babel')
const cache = require('gulp-cached')
const notify_ = require('gulp-notify')
const ava = require('gulp-ava')
const benchmark = require('gulp-benchmark')
const sequence = require('run-sequence')
const webpack = require('webpack-stream')
const del = require('del')
const processEnv = require('gulp-process-env')

const babelOptions = JSON.parse(fs.readFileSync('.babelrc', 'utf-8'))

gulp.task('compile', [
  'compile-bin',
  'compile-lib',
  'compile-server',
  'compile-client'
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
  'build-dev-client',
  'build-client'
])

gulp.task('build-dev-client', ['compile-lib', 'compile-client'], () => {
  return gulp
  .src('dist/client/next-dev.js')
  .pipe(webpack({
    quiet: true,
    output: { filename: 'next-dev.bundle.js' },
    module: {
      loaders: [
        {
          test: /eval-script\.js$/,
          exclude: /node_modules/,
          loader: 'babel',
          query: {
            plugins: [
              'babel-plugin-transform-remove-strict-mode'
            ]
          }
        }
      ]
    }
  }))
  .pipe(gulp.dest('dist/client'))
  .pipe(notify('Built dev client'))
})

gulp.task('build-client', ['compile-lib', 'compile-client'], () => {
  return gulp
  .src('dist/client/next.js')
  .pipe(webpack({
    quiet: true,
    output: { filename: 'next.bundle.js' },
    plugins: [
      new webpack.webpack.DefinePlugin({
        'process.env': {
          NODE_ENV: JSON.stringify('production')
        }
      }),
      new webpack.webpack.optimize.UglifyJsPlugin()
    ],
    module: {
      loaders: [
        {
          test: /eval-script\.js$/,
          exclude: /node_modules/,
          loader: 'babel',
          query: {
            plugins: [
              'babel-plugin-transform-remove-strict-mode'
            ]
          }
        }
      ]
    }
  }))
  .pipe(gulp.dest('dist/client'))
  .pipe(notify('Built release client'))
})

gulp.task('test', () => {
  const env = processEnv({NODE_ENV: 'test'})
  return gulp.src('test/**/**.test.js')
  .pipe(env)
  .pipe(ava({
    verbose: true,
    nyc: true
  }))
  .pipe(env.restore())
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
  'test',
  'watch'
])

gulp.task('release', (cb) => {
  sequence('clean', [
    'compile',
    'build',
    'copy',
    'test'
  ], cb)
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
