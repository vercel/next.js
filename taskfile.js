const isWindows = /^win/.test(process.platform)
const childProcess = require('child_process')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')

export async function pretest (task) {
  // Create node_modules/next for the use of test apps
  rimraf.sync('test/node_modules/next')
  mkdirp.sync('test/node_modules')

  if (isWindows) {
    const symlinkCommand = 'mklink /D "next" "..\\..\\packages\\next"'
    childProcess.execSync(symlinkCommand, { cwd: 'test/node_modules' })
  }

  // We run following task inside a NPM script chain and it runs chromedriver
  // inside a child process tree.
  // Even though we kill this task's process, chromedriver exists throughout
  // the lifetime of the original npm script.
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
