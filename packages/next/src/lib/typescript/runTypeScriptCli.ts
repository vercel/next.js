import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import spawn from 'next/dist/compiled/cross-spawn'

import { bold } from '../picocolors'
import { resolveFrom } from '../resolve-from'

export interface TypeScriptPackageInfo {
  packageJsonPath: string
  packageDir: string
  version: string
  apiPath?: string
  tscPath?: string
}

export function getTypeScriptPackageInfo(
  baseDir: string
): TypeScriptPackageInfo | null {
  let packageJsonPath: string
  try {
    packageJsonPath = resolveFrom(baseDir, 'typescript/package.json')
  } catch {
    return null
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    version: string
    type?: string
    bin?: string | Record<string, string>
  }
  const packageDir = path.dirname(packageJsonPath)
  const apiPath = path.join(packageDir, 'lib', 'typescript.js')
  const tscBin =
    typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.tsc
  const tscBinPath = tscBin ? path.resolve(packageDir, tscBin) : undefined
  let tscPath = tscBinPath

  if (
    tscBinPath &&
    existsSync(tscBinPath) &&
    packageJson.type === 'module' &&
    path.extname(tscBinPath) === ''
  ) {
    // TypeScript 7's extensionless ESM bin wrapper cannot be used as Node's
    // main entry point on Node.js 20.9. Its imported JS entry is the same CLI
    // wrapper and works across all supported Node.js versions.
    const tscJsPath = path.join(packageDir, 'lib', 'tsc.js')
    if (existsSync(tscJsPath)) {
      tscPath = tscJsPath
    }
  }

  return {
    packageJsonPath,
    packageDir,
    version: packageJson.version,
    apiPath: existsSync(apiPath) ? apiPath : undefined,
    tscPath: tscPath && existsSync(tscPath) ? tscPath : undefined,
  }
}

export function hasNativeTypeScriptPreview(baseDir: string): boolean {
  try {
    resolveFrom(baseDir, '@typescript/native-preview/package.json')
    return true
  } catch {
    return false
  }
}

export function getTypeScriptApiMissingError(version: string): Error {
  return new Error(
    `TypeScript ${version} does not provide the compiler API required by Next.js. ` +
      `Enable ${bold('experimental.useTypeScriptCli')} in your Next.js config to use the TypeScript CLI, ` +
      `or install TypeScript 6 instead.`
  )
}

export interface TypeScriptCliResult {
  exitCode: number
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

const terminationSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP']

export function runTypeScriptCli({
  cwd,
  tscPath,
  args,
  captureOutput = false,
  onFirstOutput,
}: {
  cwd: string
  tscPath: string
  args: string[]
  /**
   * Accumulate stdout/stderr into the resolved result instead of forwarding it
   * to this process's stdout/stderr (for e.g. parsing `--showConfig` output).
   */
  captureOutput?: boolean
  /**
   * Called once, on the first chunk of forwarded output. Used to stop the build
   * spinner before `tsc`'s diagnostics appear. Not called when capturing.
   */
  onFirstOutput?: () => void
}): Promise<TypeScriptCliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tscPath, ...args], {
      cwd,
      // TypeScript 7's Node wrapper starts the native compiler synchronously
      // on older Node.js releases. A separate process group lets termination
      // reach both processes instead of orphaning the native compiler.
      detached: process.platform !== 'win32',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Piping stdio makes `tsc` disable colored/pretty diagnostics. Restore
        // them when we are forwarding output to a TTY (not capturing it for
        // parsing, e.g. `--showConfig`).
        ...(!captureOutput && process.stdout.isTTY
          ? { FORCE_COLOR: '1' }
          : undefined),
      },
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')

    if (captureOutput) {
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk
      })
    } else {
      const forward = (dest: NodeJS.WriteStream, chunk: string) => {
        onFirstOutput?.()
        onFirstOutput = undefined // ensure we don't call it again
        dest.write(chunk)
      }

      child.stdout?.on('data', (chunk: string) => {
        forward(process.stdout, chunk)
      })
      child.stderr?.on('data', (chunk: string) => {
        forward(process.stderr, chunk)
      })
    }

    let terminationRequested = false
    const terminateChild = () => {
      if (terminationRequested || child.killed || child.pid === undefined) {
        return
      }
      terminationRequested = true

      // The native compiler ignores SIGTERM and SIGINT, so send a kill signal.
      // Target the whole process group so the signal reaches the native compiler whether
      // it is a grandchild or a direct child.
      // https://github.com/microsoft/typescript-go/pull/4592 should improve this in the long run
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } else {
        try {
          // https://www.youtube.com/watch?v=Fow7iUaKrq4
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          // The process may have exited between the lifecycle event and kill.
        }
      }
    }
    const terminateOnExit = () => terminateChild()
    process.once('exit', terminateOnExit)

    const handler = () => {
      terminateChild()
      process.exit(1)
    }
    for (const signal of terminationSignals) {
      process.once(signal, handler)
    }

    const cleanup = () => {
      process.off('exit', terminateOnExit)
      for (const signal of terminationSignals) {
        process.off(signal, handler)
      }
    }

    let settled = false
    const finish = (settle: () => void) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      settle()
    }

    child.on('error', (error) => {
      finish(() => reject(error))
    })
    child.on('close', (code, signal) => {
      finish(() => {
        resolve({
          exitCode: code ?? 1,
          signal,
          stdout,
          stderr,
        })
      })
    })
  })
}

export async function getTypeScriptConfigurationCli({
  baseDir,
  tsConfigPath,
  tscPath,
}: {
  baseDir: string
  tsConfigPath: string
  tscPath: string
}): Promise<{ compilerOptions: Record<string, any> }> {
  const result = await runTypeScriptCli({
    cwd: baseDir,
    tscPath,
    args: ['--showConfig', '--project', tsConfigPath, '--pretty', 'false'],
    captureOutput: true,
  })

  if (result.exitCode !== 0) {
    throw new Error(
      [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    )
  }

  try {
    return JSON.parse(result.stdout)
  } catch (cause) {
    throw new Error(`Could not parse output from TypeScript's --showConfig.`, {
      cause,
    })
  }
}
