const notifier = require('node-notifier')
const childProcess = require('child_process')
const isWindows = /^win/.test(process.platform)

export async function compile (fly) {
  await fly.parallel(['bin', 'server', 'lib', 'client'])
}

export async function bin (fly, opts) {
  await fly.source(opts.src || 'bin/*').babel().target('dist/bin', {mode: parseInt('0755', 8)})
  notify('Compiled binaries')
}

export async function lib (fly, opts) {
  await fly.source(opts.src || 'lib/**/*.js').babel().target('dist/lib')
  notify('Compiled lib files')
}

export async function server (fly, opts) {
  await fly.source(opts.src || 'server/**/*.js').babel().target('dist/server')
  notify('Compiled server files')
}

export async function client (fly, opts) {
  await fly.source(opts.src || 'client/**/*.js').babel().target('dist/client')
  notify('Compiled client files')
}

export async function copy (fly) {
  await fly.source('pages/**/*.js').target('dist/pages')
}

export async function build (fly) {
  await fly.serial(['copy', 'compile'])
}

export default async function (fly) {
  await fly.start('build')
  await fly.watch('bin/*', 'bin')
  await fly.watch('pages/**/*.js', 'copy')
  await fly.watch('server/**/*.js', 'server')
  await fly.watch('client/**/*.js', ['client'])
  await fly.watch('lib/**/*.js', ['lib'])
}

export async function release (fly) {
  await fly.clear('dist').start('build')
}

// We run following task inside a NPM script chain and it runs chromedriver
// inside a child process tree.
// Even though we kill this task's process, chromedriver exists throughout
// the lifetime of the original npm script.

export async function pretest (fly) {
  const processName = isWindows ? 'chromedriver.cmd' : 'chromedriver'
  // eslint-disable-next-line
  const chromedriver = childProcess.spawn(processName, { stdio: 'inherit' })
  // We need to do this, otherwise this task's process will keep waiting.
  setTimeout(() => process.exit(0), 2000)
}

export async function posttest (fly) {
  try {
    const cmd = isWindows ? 'taskkill /im chromedriver* /t /f' : 'pkill chromedriver'
    childProcess.execSync(cmd, { stdio: 'ignore' })
  } catch (err) {
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
