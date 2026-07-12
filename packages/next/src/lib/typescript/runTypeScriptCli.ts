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
}: {
  cwd: string
  tscPath: string
  args: string[]
  captureOutput?: boolean
}): Promise<TypeScriptCliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tscPath, ...args], {
      cwd,
      // TypeScript 7's Node wrapper starts the native compiler synchronously
      // on older Node.js releases. A separate process group lets termination
      // reach both processes instead of orphaning the native compiler.
      detached: process.platform !== 'win32',
      shell: false,
      stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: {
        ...process.env,
      },
    })

    let stdout = ''
    let stderr = ''

    if (captureOutput) {
      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk
      })
    }

    let terminationRequested = false
    const terminateChild = (signal: NodeJS.Signals = 'SIGTERM') => {
      if (terminationRequested || child.killed) {
        return
      }
      terminationRequested = true

      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } else if (child.pid) {
        try {
          process.kill(-child.pid, signal)
        } catch {
          // The process may have exited between the lifecycle event and kill.
        }
      } else {
        child.kill(signal)
      }
    }
    const terminateOnExit = () => terminateChild()
    process.once('exit', terminateOnExit)

    let receivedSignal: NodeJS.Signals | undefined
    const signalHandlers = new Map<NodeJS.Signals, () => void>()
    const createSignalHandler = (signal: NodeJS.Signals) => () => {
      receivedSignal ??= signal
      terminateChild(signal)
    }
    for (const signal of terminationSignals) {
      const handler = createSignalHandler(signal)
      signalHandlers.set(signal, handler)
      process.once(signal, handler)
    }

    const cleanup = () => {
      process.off('exit', terminateOnExit)
      for (const [signal, handler] of signalHandlers) {
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

      if (receivedSignal) {
        const signal = receivedSignal
        try {
          // Installing a signal handler replaces Node.js' default termination.
          // Re-send the signal after the child exits so this process preserves
          // the original exit semantics instead of treating cancellation as a
          // successful type check.
          process.kill(process.pid, signal)
        } catch (error) {
          reject(error)
          return
        }

        // If another listener consumes the re-sent signal, still fail instead
        // of leaving the type-check promise pending indefinitely.
        setImmediate(() => {
          reject(new Error(`TypeScript CLI interrupted by ${signal}`))
        })
        return
      }

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
