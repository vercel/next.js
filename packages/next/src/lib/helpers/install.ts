import { yellow } from '../picocolors'
import spawn from 'next/dist/compiled/cross-spawn'
import type { PackageManager } from './get-pkg-manager'
import { isUpgradeOutputPending, pipeWorkerOutput } from '../upgrade-output'

interface InstallArgs {
  /**
   * Indicate whether to install packages using npm, pnpm, or yarn.
   */
  packageManager: PackageManager
  /**
   * Indicate whether there is an active internet connection.
   */
  isOnline: boolean
  /**
   * Indicate whether the given dependencies are devDependencies.
   */
  devDependencies?: boolean
}

/**
 * Spawn a package manager installation with either npm, pnpm, or yarn.
 *
 * @returns A Promise that resolves once the installation is finished.
 */
export function install(
  root: string,
  dependencies: string[],
  { packageManager, isOnline, devDependencies }: InstallArgs
): Promise<void> {
  let args: string[] = []

  if (dependencies.length > 0) {
    if (packageManager === 'yarn') {
      args = ['add', '--exact']
      if (devDependencies) args.push('--dev')
    } else if (packageManager === 'pnpm') {
      args = ['add', '--save-exact']
      args.push(devDependencies ? '--save-dev' : '--save-prod')
    } else {
      // npm
      args = ['install', '--save-exact']
      args.push(devDependencies ? '--save-dev' : '--save')
    }

    args.push(...dependencies)
  } else {
    args = ['install'] // npm, pnpm, and yarn all support `install`

    if (!isOnline) {
      args.push('--offline')
      console.log(yellow('You appear to be offline.'))
      if (packageManager !== 'npm') {
        console.log(
          yellow(`Falling back to the local ${packageManager} cache.`)
        )
      }
      console.log()
    }
  }

  return new Promise<void>((resolve, reject) => {
    // While the upgrade choice is pending, route logs through the held streams.
    // New installs after Skip keep their existing terminal behavior.
    const captureOutput = isUpgradeOutputPending()
    // Automatic installs normally need no input. Keep stdin unavailable while
    // the menu owns it; install scripts requiring input are not supported here,
    // even after Skip, since the running install keeps its original stdio.
    const child = spawn(packageManager, args, {
      cwd: root,
      stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: {
        ...process.env,
        // Piped output loses automatic color detection. Preserve explicit color
        // settings and enable colors only when the caller has not opted out.
        ...(captureOutput && process.stdout.isTTY && !process.env.NO_COLOR
          ? { FORCE_COLOR: process.env.FORCE_COLOR ?? '1' }
          : {}),
        ADBLOCK: '1',
        // we set NODE_ENV to development as pnpm skips dev
        // dependencies when production
        NODE_ENV: 'development',
        DISABLE_OPENCOLLECTIVE: '1',
      },
    })

    // Keep consuming both pipes while corked so installation cannot stall on
    // buffered logs. Skip or the fatal exit path flushes the same child streams.
    if (child.stdout) {
      pipeWorkerOutput(child.stdout, process.stdout)
    }
    if (child.stderr) {
      pipeWorkerOutput(child.stderr, process.stderr)
    }

    child.once('error', reject)
    child.once('close', (code) => {
      if (code !== 0) {
        reject({ command: `${packageManager} ${args.join(' ')}` })
        return
      }
      resolve()
    })
  })
}
