const { execSync, execFileSync, spawn } = require('child_process')
const { existsSync } = require('fs')
const globOrig = require('glob')
const { join } = require('path')
const { promisify } = require('util')

const glob = promisify(globOrig)
exports.glob = glob

const NEXT_DIR = join(__dirname, '..')

exports.NEXT_DIR = NEXT_DIR

/**
 * @param {string} title
 * @param {string | string[]} command
 * @param {ExecSyncOptions} [opts]
 * @returns {string}
 */
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

exports.exec = exec

/**
 * @param {string} title
 * @param {string | string[]} command
 * @param {SpawnOptions} [opts]
 */
function execAsyncWithOutput(title, command, opts) {
  logCommand(title, command)
  const proc = spawn(command[0], command.slice(1), {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    cwd: NEXT_DIR,
    ...opts,
  })
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
      const err = new Error(
        `Command failed with exit code ${code}: ${prettyCommand(command)}`
      )
      err.code = code
      err.stdout = Buffer.concat(stdout)
      err.stderr = Buffer.concat(stderr)
      reject(err)
    })
  })
}

exports.execAsyncWithOutput = execAsyncWithOutput

/**
 * @template T
 * @param {string} title
 * @param {() => T} fn
 * @returns {T}
 */
function execFn(title, fn) {
  logCommand(title, fn.toString())
  return fn()
}

exports.execFn = execFn

/**
 * @param {string | string[]} command
 */
function prettyCommand(command) {
  if (Array.isArray(command)) command = command.join(' ')
  return command.replace(/ -- .*/, ' -- …')
}

/**
 * @param {string} title
 * @param {string | string[]} [command]
 */
function logCommand(title, command) {
  if (command) {
    const pretty = prettyCommand(command)
    console.log(`\n\x1b[1;4m${title}\x1b[0m\n> \x1b[1m${pretty}\x1b[0m\n`)
  } else {
    console.log(`\n\x1b[1;4m${title}\x1b[0m\n`)
  }
}

exports.logCommand = logCommand

/**
 * @param {string[]} args
 * @param {string} name
 * @returns {boolean}
 */
function booleanArg(args, name) {
  const index = args.indexOf(name)
  if (index === -1) return false
  args.splice(index, 1)
  return true
}

exports.booleanArg = booleanArg

/**
 * @param {string[]} args
 * @param {string} name
 * @returns {?string}
 */
function namedValueArg(args, name) {
  const index = args.indexOf(name)
  if (index === -1) return null
  return args.splice(index, 2)[1]
}

exports.namedValueArg = namedValueArg

const DEFAULT_GLOBS = ['**', '!target', '!node_modules', '!crates', '!.turbo']
const FORCED_GLOBS = ['package.json', 'README*', 'LICENSE*', 'LICENCE*']

/**
 * @param {string} path
 * @returns {Promise<string[]>}
 */
async function packageFiles(path) {
  const { files = DEFAULT_GLOBS, main, bin } = require(`${path}/package.json`)

  const allFiles = files.concat(
    FORCED_GLOBS,
    main ?? [],
    Object.values(bin ?? {})
  )
  const isGlob = (f) => f.includes('*') || f.startsWith('!')
  const simpleFiles = allFiles
    .filter((f) => !isGlob(f) && existsSync(join(path, f)))
    .map((f) => f.replace(/^\.\//, ''))
  const globFiles = allFiles.filter(isGlob)
  const globbedFiles = await glob(
    `+(${globFiles.filter((f) => !f.startsWith('!')).join('|')})`,
    {
      cwd: path,
      ignore: `+(${globFiles
        .filter((f) => f.startsWith('!'))
        .map((f) => f.slice(1))
        .join('|')})`,
    }
  )
  const packageFiles = [...globbedFiles, ...simpleFiles].sort()
  const set = new Set()
  return packageFiles.filter((f) => {
    if (set.has(f)) return false
    // We add the full path, but check for parent directories too.
    // This catches the case where the whole directory is added and then a single file from the directory.
    // The sorting before ensures that the directory comes before the files inside of the directory.
    set.add(f)
    while (f.includes('/')) {
      f = f.replace(/\/[^/]+$/, '')
      if (set.has(f)) return false
    }
    return true
  })
}

exports.packageFiles = packageFiles
