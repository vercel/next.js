/* eslint-disable import/no-extraneous-dependencies */
import spawn from 'cross-spawn'
import type { PackageManager } from './get-pkg-manager'

/**
 * Runs `next typegen` using the package manager to execute the locally installed Next.js binary.
 * Assumes the current working directory is the project root where Next is installed.
 */
export async function runTypegen(
  packageManager: PackageManager
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Determine the command and arguments based on the package manager
    let command: string
    let args: string[]

    switch (packageManager) {
      case 'npm':
        command = 'npx'
        args = ['next', 'typegen']
        break
      case 'yarn':
        command = 'yarn'
        args = ['next', 'typegen']
        break
      case 'pnpm':
        command = 'pnpm'
        args = ['next', 'typegen']
        break
      case 'bun':
        command = 'bun'
        args = ['next', 'typegen']
        break
      default:
        packageManager satisfies never
        throw new Error(`Unsupported package manager: ${packageManager}`)
    }

    const child = spawn(command, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
      },
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`next typegen exited with code ${code}`))
        return
      }
      resolve()
    })
  })
}
