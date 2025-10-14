/* eslint-disable import/no-extraneous-dependencies */
import spawn from 'cross-spawn'
import type { PackageManager } from './get-pkg-manager'

/**
 * Get the major version of Yarn installed on the system.
 * Returns 1 if Yarn is not installed or version cannot be determined.
 */
async function getYarnVersion(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('yarn', ['--version'], { stdio: 'pipe' })
    let output = ''

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        output += data.toString()
      })
    }

    child.on('close', () => {
      const version = output.trim()
      const majorVersion = parseInt(version.split('.')[0], 10)
      resolve(isNaN(majorVersion) ? 1 : majorVersion)
    })

    child.on('error', () => {
      // If yarn command fails, assume v1
      resolve(1)
    })
  })
}

/**
 * Runs ShadCN init using the appropriate package manager command.
 * Assumes the current working directory is the project root.
 */
export async function runShadcnInit(
  packageManager: PackageManager
): Promise<void> {
  // Determine the command and arguments based on the package manager
  let command: string
  let args: string[]

  switch (packageManager) {
    case 'npm':
      command = 'npx'
      args = ['shadcn@latest', 'init']
      break
    case 'yarn': {
      // Check Yarn version - v1 doesn't support the direct package syntax
      const yarnVersion = await getYarnVersion()
      if (yarnVersion >= 2) {
        // Yarn 2+ (Berry) supports: yarn dlx shadcn@latest init
        command = 'yarn'
        args = ['dlx', 'shadcn@latest', 'init']
      } else {
        // Yarn 1.x (Classic) doesn't support dlx, use npx instead
        command = 'npx'
        args = ['shadcn@latest', 'init']
      }
      break
    }
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
      throw new Error(`Unsupported package manager: ${packageManager}`)
  }

  return new Promise((resolve, reject) => {
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
