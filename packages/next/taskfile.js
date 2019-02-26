const notifier = require('node-notifier')
const path = require('path')
const fs = require('fs')

const babelOpts = {
  presets: [
    ['@babel/preset-env', {
      modules: 'commonjs',
      'targets': {
        'browsers': ['IE 11']
      }
    }]
  ],
  plugins: [
    ['@babel/plugin-transform-runtime', {
      corejs: 2,
      helpers: true,
      regenerator: true,
      useESModules: false
    }]
  ]
}

// This function writes a minimal `package.json` file for a compiled package.
// It defines `name` and `main`. It also defines `types` (intended for
// development usage only).
function writePackageManifest (packageName) {
  const packagePath = require.resolve(packageName + '/package.json')
  const { name, main, types, typings } = require(packagePath)

  let typesFile = types || typings
  if (typesFile) {
    typesFile = require.resolve(path.join(packageName, typesFile))
  }

  const compiledPackagePath = path.join(__dirname, `dist/compiled/${packageName}`)
  fs.writeFileSync(
    path.join(compiledPackagePath, './package.json'),
    JSON.stringify(
      Object.assign(
        {},
        { name, main: `${path.basename(main, '.' + path.extname(main))}` },
        typesFile
          ? {
            types: path.relative(compiledPackagePath, typesFile)
          }
          : undefined
      )
    ) + '\n'
  )
}

export async function nccunistore (task, opts) {
  await task
    .source(opts.src || path.relative(__dirname, require.resolve('unistore')))
    .ncc()
    .target('dist/compiled/unistore')
  writePackageManifest('unistore')
}

export async function precompile (task) {
  await task.parallel(['nccunistore'])
}

export async function compile (task) {
  await task.parallel(['bin', 'server', 'nextbuild', 'nextbuildstatic', 'pages', 'lib', 'client'])
}

export async function bin (task, opts) {
  await task.source(opts.src || 'bin/*').typescript({ module: 'commonjs', stripExtension: true }).target('dist/bin', { mode: '0755' })
  notify('Compiled binaries')
}

export async function lib (task, opts) {
  await task.source(opts.src || 'lib/**/*.+(js|ts|tsx)').typescript({ module: 'commonjs' }).target('dist/lib')
  notify('Compiled lib files')
}

export async function server (task, opts) {
  await task.source(opts.src || 'server/**/*.+(js|ts|tsx)').typescript({ module: 'commonjs' }).target('dist/server')
  notify('Compiled server files')
}

export async function nextbuild (task, opts) {
  await task.source(opts.src || 'build/**/*.+(js|ts|tsx)').typescript({ module: 'commonjs' }).target('dist/build')
  notify('Compiled build files')
}

export async function client (task, opts) {
  await task.source(opts.src || 'client/**/*.+(js|ts|tsx)').typescript({ module: 'commonjs' }).babel(babelOpts).target('dist/client')
  notify('Compiled client files')
}

// export is a reserved keyword for functions
export async function nextbuildstatic (task, opts) {
  await task.source(opts.src || 'export/**/*.+(js|ts|tsx)').typescript({ module: 'commonjs' }).target('dist/export')
  notify('Compiled export files')
}

export async function pages (task, opts) {
  await task.source(opts.src || 'pages/**/*.+(js|ts|tsx)').typescript({ module: 'commonjs' }).babel(babelOpts).target('dist/pages')
}

export async function build (task) {
  await task.serial(['precompile', 'compile'])
}

export default async function (task) {
  await task.clear('dist')
  await task.start('build')
  await task.watch('bin/*', 'bin')
  await task.watch('pages/**/*.+(js|ts|tsx)', 'pages')
  await task.watch('server/**/*.+(js|ts|tsx)', 'server')
  await task.watch('build/**/*.+(js|ts|tsx)', 'nextbuild')
  await task.watch('export/**/*.+(js|ts|tsx)', 'nextexport')
  await task.watch('client/**/*.+(js|ts|tsx)', 'client')
  await task.watch('lib/**/*.+(js|ts|tsx)', 'lib')
}

export async function release (task) {
  await task.clear('dist').start('build')
}

// notification helper
function notify (msg) {
  return notifier.notify({
    title: '▲ Next',
    message: msg,
    icon: false
  })
}
