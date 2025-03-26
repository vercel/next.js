import {
  execSync,
  execFileSync,
  spawn,
  ExecSyncOptionsWithStringEncoding,
} from 'child_process'
import { existsSync } from 'fs'
import globOrig from 'glob'
import { join } from 'path'
import { promisify } from 'util'

export const glob = promisify(globOrig)

export const NEXT_DIR = join(__dirname, '..')

/**
 * @param {string} title
 * @param {string | string[]} command
 * @param {ExecSyncOptions} [opts]
 * @returns {string}
 */
export function exec(title, command, opts?: ExecSyncOptionsWithStringEncoding) {
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
  code: number | null
  stdout: Buffer
  stderr: Buffer
}

type ExecOutput = {
  stdout: Buffer
  stderr: Buffer
}

/**
 * @param {string} title
 * @param {string | string[]} command
 * @param {SpawnOptions} [opts]
 */
export function execAsyncWithOutput(
  title,
  command,
  opts?: Partial<ExecSyncOptionsWithStringEncoding>
): Promise<ExecOutput> {
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

  const stdout: Buffer[] = []
  proc.stdout.on('data', (data) => {
    process.stdout.write(data)
    stdout.push(data)
  })
  const stderr: Buffer[] = []
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

/**
 * @template T
 * @param {string} title
 * @param {() => T} fn
 * @returns {T}
 */
export function execFn<T>(title: string, fn: () => T): T {
  logCommand(title, fn.toString())
  return fn()
}

/**
 * @param {string | string[]} command
 */
function prettyCommand(command: string | string[]): string {
  if (Array.isArray(command)) command = command.join(' ')
  return command.replace(/ -- .*/, ' -- …')
}

/**
 * @param {string} title
 * @param {string | string[]} [command]
 */
export function logCommand(title: string, command: string | string[]) {
  if (command) {
    const pretty = prettyCommand(command)
    console.log(`\n\x1b[1;4m${title}\x1b[0m\n> \x1b[1m${pretty}\x1b[0m\n`)
  } else {
    console.log(`\n\x1b[1;4m${title}\x1b[0m\n`)
  }
}

const DEFAULT_GLOBS = ['**', '!target', '!node_modules', '!crates', '!.turbo']
const FORCED_GLOBS = ['package.json', 'README*', 'LICENSE*', 'LICENCE*']

/**
 * @param {string} path
 * @returns {Promise<string[]>}
 */
export async function packageFiles(path: string): Promise<string[]> {
  const { files = DEFAULT_GLOBS, main, bin } = require(`${path}/package.json`)

  const allFiles: string[] = files.concat(
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
