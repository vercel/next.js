const notifier = require('node-notifier')

export async function lib (task, opts) {
  await task.source(opts.src || 'lib/**/*.+(js|ts)').typescript({module: 'commonjs'}).target('dist/lib')
  notify('Compiled lib files')
}

export async function server (task, opts) {
  await task.source(opts.src || 'server/**/*.+(js|ts)').typescript({module: 'commonjs'}).target('dist/server')
  notify('Compiled server files')
}

export async function build (task) {
  await task.parallel(['server', 'lib'])
}

export default async function (task) {
  await task.clear('dist')
  await task.start('build')
  await task.watch('server/**/*.+(js|ts)', 'server')
  await task.watch('lib/**/*.+(js|ts)', 'lib')
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
