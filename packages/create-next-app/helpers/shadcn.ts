/* eslint-disable import/no-extraneous-dependencies */
import spawn from 'cross-spawn'
import type { PackageManager } from './get-pkg-manager'

/**
 * Runs ShadCN init using the appropriate package manager command.
 * Assumes the current working directory is the project root.
 */
export async function runShadcnInit(
  packageManager: PackageManager
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Determine the command and arguments based on the package manager
    let command: string
    let args: string[]

    switch (packageManager) {
      case 'npm':
        command = 'npx'
        args = ['shadcn@latest', 'init']
        break
      case 'yarn':
        command = 'yarn'
        args = ['shadcn@latest', 'init']
        break
      case 'pnpm':
        command = 'pnpm'
        args = ['dlx', 'shadcn@latest', 'init']
        break
      case 'bun':
        command = 'bunx'
        args = ['--bun', 'shadcn@latest', 'init']
        break
      default:
        packageManager satisfies never
        reject(new Error(`Unsupported package manager: ${packageManager}`))
        return
    }

    const child = spawn(command, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
      },
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`shadcn init exited with code ${code}`))
        return
      }
      resolve()
    })
  })
}
