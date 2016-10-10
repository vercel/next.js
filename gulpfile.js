const gulp = require('gulp')
const babel = require('gulp-babel')
const cache = require('gulp-cached')
const notify_ = require('gulp-notify')
const ava = require('gulp-ava')
const sequence = require('run-sequence')
const webpack = require('webpack-stream')
const del = require('del')

const babelOptions = {
  presets: ['es2015', 'react'],
  plugins: [
    'transform-async-to-generator',
    'transform-object-rest-spread',
    'transform-class-properties',
    'transform-runtime'
  ]
}

gulp.task('compile', [
  'compile-bin',
  'compile-lib',
  'compile-server',
  'compile-client',
  'compile-test'
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

gulp.task('compile-test', () => {
  return gulp.src('test/*.js')
  .pipe(cache('test'))
  .pipe(babel(babelOptions))
  .pipe(gulp.dest('dist/test'))
  .pipe(notify('Compiled test files'))
})

gulp.task('copy-test-fixtures', () => {
  return gulp.src('test/fixtures/**/*')
  .pipe(gulp.dest('dist/test/fixtures'))
});

gulp.task('build', [
  'build-dev-client',
])

gulp.task('build-release', [
  'build-release-client'
])

gulp.task('build-dev-client', ['compile-lib', 'compile-client'], () => {
  return gulp
  .src('dist/client/next-dev.js')
  .pipe(webpack({
    quiet: true,
    output: { filename: 'next-dev.bundle.js' }
  }))
  .pipe(gulp.dest('dist/client'))
  .pipe(notify('Built dev client'))
})

gulp.task('build-release-client', ['compile-lib', 'compile-client'], () => {
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
    ]
  }))
  .pipe(gulp.dest('dist/client'))
  .pipe(notify('Built release client'))
})

gulp.task('test', ['compile', 'copy-test-fixtures'], () => {
  return gulp.src('dist/test/*.js')
  .pipe(ava())
})

gulp.task('watch', [
  'watch-bin',
  'watch-lib',
  'watch-server',
  'watch-client'
])

gulp.task('watch-bin', () => {
  return gulp.watch('bin/*', [
    'compile-bin'
  ])
})

gulp.task('watch-lib', () => {
  return gulp.watch('lib/**/*.js', [
    'compile-lib',
    'build-dev-client'
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
    'build-dev-client'
  ])
})

gulp.task('clean', () => {
  return del('dist')
})

gulp.task('clean-test', () => {
  return del('dist/test')
})

gulp.task('default', [
  'compile',
  'build',
  'test',
  'watch'
])

gulp.task('release', (cb) => {
  sequence('clean', [
    'compile',
    'build-release',
    'test'
  ], 'clean-test', cb)
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
