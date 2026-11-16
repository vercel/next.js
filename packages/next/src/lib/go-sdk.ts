import { execFile } from 'child_process'
import { existsSync, realpathSync } from 'fs'
import path from 'path'
import { promisify } from 'util'
import * as Log from '../build/output/log'

const execFileAsync = promisify(execFile)

// The Go SDK ships in the installed `next` package. A directory replacement maps
// its module path there, so builds, editors and linters resolve the SDK version
// that matches the running Next.js without downloading anything.
const GO_SDK_MODULE = 'next/go'

type GoMod = {
  Require?: Array<{ Path: string }> | null
  Replace?: Array<{
    Old: { Path: string }
    New: { Path: string; Version?: string }
  }> | null
}

function sdkDirectory(): string {
  return realpathSync(
    path.join(path.dirname(require.resolve('next/package.json')), 'go')
  )
}

async function go(dir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    process.env.TURBOPACK_GO || 'go',
    args,
    { cwd: dir, env: { ...process.env, GOWORK: 'off', GOFLAGS: '' } }
  )
  return stdout
}

// Go requires a ./ or ../ prefix for directory replacements. Turbopack rejects Go
// sources reached through symlinks (such as pnpm's node_modules/next), so the
// replacement names the SDK's real location.
function replacementPath(dir: string): string {
  const relative = path
    .relative(realpathSync(dir), sdkDirectory())
    .split(path.sep)
    .join('/')
  return relative === '..' || relative.startsWith('../')
    ? relative
    : `./${relative}`
}

function isMapped(dir: string, goMod: GoMod): boolean {
  const replacement = goMod.Replace?.find(
    ({ Old }) => Old.Path === GO_SDK_MODULE
  )
  if (!replacement || replacement.New.Version) return false
  return (
    path.resolve(realpathSync(dir), replacement.New.Path) === sdkDirectory()
  )
}

/**
 * `next dev` and `next build`: map `next/go` to the installed SDK in go.mod,
 * like TypeScript setup reconfigures tsconfig.json. Only the replacement is
 * managed; Go tooling (`go mod tidy`, `go get`, editors) adds the requirement
 * when it is imported.
 */
export async function ensureGoSdkReplacement(dir: string): Promise<void> {
  if (!existsSync(path.join(dir, 'go.mod'))) return
  try {
    const goMod: GoMod = JSON.parse(await go(dir, ['mod', 'edit', '-json']))
    if (isMapped(dir, goMod)) return
    const target = replacementPath(dir)
    if (target.startsWith('../')) {
      // Turbopack only compiles directory replacements inside the module.
      Log.warn(
        `The installed next package is outside the Go module, so ${GO_SDK_MODULE} cannot be mapped in go.mod.`
      )
      return
    }
    await go(dir, ['mod', 'edit', `-replace=${GO_SDK_MODULE}=${target}`])
    Log.info(
      `Added "replace ${GO_SDK_MODULE} => ${target}" to go.mod so Go tools resolve the Next.js Go SDK from the installed next package.`
    )
  } catch (error) {
    Log.warn(
      `Could not map ${GO_SDK_MODULE} to the installed Next.js in go.mod: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
