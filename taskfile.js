const notifier = require('node-notifier')
const childProcess = require('child_process')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const isWindows = /^win/.test(process.platform)

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

// Create node_modules/next for the use of test apps
export async function symlinkNextForTesting () {
  rimraf.sync('test/node_modules/next')
  mkdirp.sync('test/node_modules')

  const symlinkCommand = isWindows ? 'mklink /D "next" "..\\..\\"' : 'ln -s ../../ next'
  childProcess.execSync(symlinkCommand, { cwd: 'test/node_modules' })
}

export async function copy (task) {
  await task.source('pages/**/*.js').target('dist/pages')
}

export async function build (task) {
  await task.serial(['symlinkNextForTesting', 'copy', 'compile'])
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

// We run following task inside a NPM script chain and it runs chromedriver
// inside a child process tree.
// Even though we kill this task's process, chromedriver exists throughout
// the lifetime of the original npm script.

export async function pretest (task) {
  // Start chromedriver
  const processName = isWindows ? 'chromedriver.cmd' : 'chromedriver'
  childProcess.spawn(processName, { stdio: 'inherit' })

  // We need to do this, otherwise this task's process will keep waiting.
  setTimeout(() => process.exit(0), 2000)
}

export async function posttest (task) {
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
