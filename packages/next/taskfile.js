const notifier = require('node-notifier')

export async function compile (task) {
  await task.parallel(['bin', 'server', 'nextbuild', 'nextbuildstatic', 'lib', 'client'])
}

export async function bin (task, opts) {
  await task.source(opts.src || 'bin/*').babel().target('dist/bin', {mode: '0755'})
  notify('Compiled binaries')
}

export async function lib (task, opts) {
  await task.source(opts.src || 'lib/**/*.js').babel().target('dist/lib')
  notify('Compiled lib files')
}

export async function server (task, opts) {
  await task.source(opts.src || 'server/**/*.js').babel().target('dist/server')
  notify('Compiled server files')
}

export async function nextbuild (task, opts) {
  await task.source(opts.src || 'build/**/*.js').babel().target('dist/build')
  notify('Compiled build files')
}

export async function client (task, opts) {
  await task.source(opts.src || 'client/**/*.js').babel().target('dist/client')
  notify('Compiled client files')
}

// export is a reserved keyword for functions
export async function nextbuildstatic (task, opts) {
  await task.source(opts.src || 'export/**/*.js').babel().target('dist/export')
  notify('Compiled export files')
}

export async function copy (task) {
  await task.source('pages/**/*.js').target('dist/pages')
}

export async function build (task) {
  await task.serial(['copy', 'compile'])
}

export default async function (task) {
  await task.start('build')
  await task.watch('bin/*', 'bin')
  await task.watch('pages/**/*.js', 'copy')
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
