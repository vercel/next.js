import { spawn } from 'child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import { retry } from 'next-test-utils'
import { CNA_PATH, useTempDir } from './utils'

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * A stand-in for the package manager that ignores SIGINT, as npm does on macOS
 * while it unwinds a stalled install. A process that exits the instant it is
 * signalled cannot be orphaned, so the shim is what makes this deterministic
 * rather than dependent on a slow network.
 */
function writeShimPackageManager(binDir: string, pidFile: string) {
  mkdirSync(binDir, { recursive: true })
  const shim = join(binDir, 'npm')
  writeFileSync(
    shim,
    [
      '#!/bin/sh',
      'trap "" INT',
      `echo $$ > "${pidFile}"`,
      'i=0',
      'while [ $i -lt 600 ]; do sleep 0.1; i=$((i+1)); done',
      '',
    ].join('\n')
  )
  chmodSync(shim, 0o755)
}

// Process groups and the shell shim are POSIX-only.
const describePosix = process.platform === 'win32' ? describe.skip : describe

describePosix('create-next-app interrupted with Ctrl+C', () => {
  it('should terminate the package manager and exit 130', async () => {
    await useTempDir(async (cwd) => {
      const binDir = join(cwd, 'shim-bin')
      const pidFile = join(cwd, 'package-manager.pid')
      writeShimPackageManager(binDir, pidFile)

      const cna = spawn(
        'node',
        [CNA_PATH, 'interrupted-app', '--yes', '--use-npm'],
        {
          cwd,
          // Give create-next-app its own process group so the test can signal
          // the group, which is what a terminal does on Ctrl+C.
          detached: true,
          stdio: 'pipe',
          env: {
            ...process.env,
            PATH: `${binDir}:${process.env.PATH}`,
            // create-next-app picks the package manager from this; clearing it
            // keeps the run on the `npm` shim even when jest runs under pnpm.
            npm_config_user_agent: undefined,
          },
        }
      )

      let packageManagerPid: number | undefined

      try {
        await retry(async () => {
          expect(existsSync(pidFile)).toBe(true)
        })
        packageManagerPid = Number(readFileSync(pidFile, 'utf8').trim())
        expect(isAlive(packageManagerPid)).toBe(true)

        process.kill(-cna.pid, 'SIGINT')

        const exitCode = await new Promise<number | null>((resolve) =>
          cna.on('exit', resolve)
        )

        // 128 + SIGINT. Exiting 0 would report an aborted scaffold as success.
        expect(exitCode).toBe(130)

        // The regression: create-next-app used to exit on its own, leaving the
        // package manager reparented to init with the terminal it inherited,
        // still drawing its spinner over the shell prompt that had returned.
        await retry(async () => {
          expect(isAlive(packageManagerPid)).toBe(false)
        })
      } finally {
        if (packageManagerPid && isAlive(packageManagerPid)) {
          process.kill(packageManagerPid, 'SIGKILL')
        }
      }
    })
  })
})
