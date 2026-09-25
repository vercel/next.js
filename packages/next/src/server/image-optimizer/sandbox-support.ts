import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
let supportCheck: Promise<string | undefined> | undefined

async function checkSupport(): Promise<string | undefined> {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return `unsupported platform ${process.platform}`
  }
  try {
    const { SandboxManager } = await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */
      '@anthropic-ai/sandbox-runtime'
    )
    const { errors } = SandboxManager.checkDependencies()
    if (errors.length) return errors.join(', ')

    // Installed tools alone are insufficient: containers may forbid namespaces
    // or sandbox creation. Probe only trusted OS code, never an input image.
    const command =
      process.platform === 'darwin' ? '/usr/bin/sandbox-exec' : 'bwrap'
    const args =
      process.platform === 'darwin'
        ? ['-p', '(version 1)(allow default)', '/usr/bin/true']
        : [
            '--ro-bind',
            '/',
            '/',
            '--unshare-all',
            '--die-with-parent',
            '--proc',
            '/proc',
            '--dev',
            '/dev',
            '/bin/true',
          ]
    await execFileAsync(command, args, { timeout: 5000, killSignal: 'SIGKILL' })
    return undefined
  } catch {
    return 'sandbox prerequisites or OS permissions are unavailable'
  }
}

export async function resolveImageOptimizerWorker(
  requested: boolean | undefined,
  check = () => (supportCheck ??= checkSupport())
): Promise<boolean> {
  if (requested === false) return false
  const reason = await check()
  if (!reason) return true
  if (requested === true) {
    throw new Error(`experimental.imgOptWorker cannot be enabled: ${reason}`)
  }
  return false
}
