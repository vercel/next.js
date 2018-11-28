const notifier = require('node-notifier')

export async function compile (task) {
  await task.parallel(['bin', 'server', 'nextbuild', 'nextbuildstatic', 'pages', 'lib', 'client'])
}

export async function bin (task, opts) {
  await task.source(opts.src || 'bin/*').typescript({module: 'commonjs'}).target('dist/bin', {mode: '0755'})
  notify('Compiled binaries')
}

export async function lib (task, opts) {
  await task.source(opts.src || 'lib/**/*.js').typescript({module: 'commonjs'}).target('dist/lib')
  notify('Compiled lib files')
}

export async function server (task, opts) {
  await task.source(opts.src || 'server/**/*.js').typescript({module: 'commonjs'}).target('dist/server')
  notify('Compiled server files')
}

export async function nextbuild (task, opts) {
  await task.source(opts.src || 'build/**/*.js').typescript({module: 'commonjs'}).target('dist/build')
  notify('Compiled build files')
}

export async function client (task, opts) {
  await task.source(opts.src || 'client/**/*.js').typescript().target('dist/client')
  notify('Compiled client files')
}

// export is a reserved keyword for functions
export async function nextbuildstatic (task, opts) {
  await task.source(opts.src || 'export/**/*.js').typescript({module: 'commonjs'}).target('dist/export')
  notify('Compiled export files')
}

export async function pages (task, opts) {
  await task.source(opts.src || 'pages/**/*.js').typescript().target('dist/pages')
}

export async function build (task) {
  await task.serial(['compile'])
}

export default async function (task) {
  await task.start('build')
  await task.watch('bin/*', 'bin')
  await task.watch('pages/**/*.js', 'pages')
  await task.watch('server/**/*.js', 'server')
  await task.watch('build/**/*.js', 'nextbuild')
  await task.watch('export/**/*.js', 'nextexport')
  await task.watch('client/**/*.js', 'client')
  await task.watch('lib/**/*.js', 'lib')
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
