const { execSync, execFileSync, spawn } = require('child_process')
const { existsSync } = require('fs')
const globOrig = require('glob')
const { join } = require('path')
const { promisify } = require('util')

const glob = promisify(globOrig)
const NEXT_DIR = join(__dirname, '..')

function exec(title, command, opts) {
  if (Array.isArray(command)) {
    logCommand(title, command)
    return execFileSync(command[0], command.slice(1), {
      stdio: 'inherit',
      cwd: NEXT_DIR,
      ...opts,
    })
  } else {
    logCommand(title, command)
    return execSync(command, {
      stdio: 'inherit',
      cwd: NEXT_DIR,
      ...opts,
    })
  }
}

class ExecError extends Error {
  // code, stdout, and stderr are assigned after instantiation
}

function execAsyncWithOutput(title, command, opts) {
  logCommand(title, command)
  const proc = spawn(command[0], command.slice(1), {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    cwd: NEXT_DIR,
    ...opts,
  })

  if (!proc || !proc.stdout || !proc.stderr) {
    throw new Error(`Failed to spawn: ${title}`)
  }

  const stdout = []
  proc.stdout.on('data', (data) => {
    process.stdout.write(data)
    stdout.push(data)
  })
  const stderr = []
  proc.stderr.on('data', (data) => {
    process.stderr.write(data)
    stderr.push(data)
  })

  return new Promise((resolve, reject) => {
    proc.on('exit', (code) => {
      if (code === 0) {
        return resolve({
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
        })
      }
      const err = new ExecError(
        `Command failed with exit code ${code}: ${prettyCommand(command)}`
      )
      err.code = code
      err.stdout = Buffer.concat(stdout)
      err.stderr = Buffer.concat(stderr)
      reject(err)
    })
  })
}

function execFn(title, fn) {
  logCommand(title, fn.toString())
  return fn()
}

function prettyCommand(command) {
  if (Array.isArray(command)) command = command.join(' ')
  return command.replace(/ -- .*/, ' -- …')
}

function logCommand(title, command) {
  if (command) {
    const pretty = prettyCommand(command)
    console.log(`\n\x1b[1;4m${title}\x1b[0m\n> \x1b[1m${pretty}\x1b[0m\n`)
  } else {
    console.log(`\n\x1b[1;4m${title}\x1b[0m\n`)
  }
}

const DEFAULT_GLOBS = ['**', '!target', '!node_modules', '!crates', '!.turbo']
const FORCED_GLOBS = ['package.json', 'README*', 'LICENSE*', 'LICENCE*']

async function packageFiles(packagePath) {
  const { files = DEFAULT_GLOBS, main, bin } = require(
    `${packagePath}/package.json`
  )

  const allFiles = files.concat(
    FORCED_GLOBS,
    main ?? [],
    Object.values(bin ?? {})
  )

  const isGlob = (f) => f.includes('*') || f.startsWith('!')
  const simpleFiles = allFiles
    .filter((f) => !isGlob(f) && existsSync(join(packagePath, f)))
    .map((f) => f.replace(/^\.\//, ''))
  const globFiles = allFiles.filter(isGlob)

  const globbedFiles = await glob(
    `+(${globFiles.filter((f) => !f.startsWith('!')).join('|')})`,
    {
      cwd: packagePath,
      ignore: `+(${globFiles
        .filter((f) => f.startsWith('!'))
        .map((f) => f.slice(1))
        .join('|')})`,
    }
  )

  const filesToSort = [...globbedFiles, ...simpleFiles].sort()
  const set = new Set()
  return filesToSort.filter((f) => {
    if (set.has(f)) return false
    set.add(f)
    let currentPath = f
    while (currentPath.includes('/')) {
      currentPath = currentPath.replace(/\/[^/]+$/, '')
      if (set.has(currentPath)) return false
    }
    return true
  })
}

/**
 * Checks if a specific boolean argument is present in process.argv.
 * @param {string} argName - The name of the argument to check (e.g., '--dry-run' or '-d').
 * @returns {boolean} - True if the argument is found, false otherwise.
 */
function booleanArg(argName) {
  return process.argv.includes(argName)
}

module.exports = {
  glob,
  NEXT_DIR,
  exec,
  execAsyncWithOutput,
  execFn,
  logCommand,
  packageFiles,
  booleanArg,
}
