import { execFile } from 'child_process'
import { existsSync, promises as fs, realpathSync } from 'fs'
import path from 'path'
import { promisify } from 'util'
import * as Log from '../build/output/log'

const execFileAsync = promisify(execFile)

// The Go SDK ships in the installed `next` package. A directory replacement maps
// its module path there, so builds, editors and linters resolve the SDK version
// that matches the running Next.js without downloading anything.
const GO_SDK_MODULE = 'next/go'
// Go accepts any version for a module replaced by a directory. Use the same one
// everywhere, so apps and libraries that import the SDK agree.
const GO_SDK_VERSION = 'v0.0.0'

type GoMod = {
  Require?: Array<{ Path: string; Version: string }> | null
  Replace?: Array<{
    Old: { Path: string; Version?: string }
    New: { Path: string; Version?: string }
  }> | null
}

export type GoSdkOptions = {
  /** The Next.js project directory. */
  dir: string
  /**
   * Turbopack's root (`turbopack.root`, `outputFileTracingRoot`, or `dir`). In a
   * monorepo this is the workspace root: the Go module can live there or in the
   * project, and the SDK can be installed anywhere below it.
   */
  rootDir: string
  /** The build output directory, which never contains Go sources. */
  distDir?: string
  /** The SDK directory. Defaults to `go` in the installed `next` package. */
  sdkDir?: string
}

function defaultSdkDirectory(): string {
  return path.join(path.dirname(require.resolve('next/package.json')), 'go')
}

async function go(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    process.env.TURBOPACK_GO || 'go',
    args,
    {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      // Match the environment Turbopack builds with: no workspace, no network,
      // no toolchain switching, and no user GOFLAGS such as -mod=mod.
      env: {
        ...process.env,
        GOWORK: 'off',
        GOFLAGS: '',
        GOPROXY: 'off',
        GOTOOLCHAIN: 'local',
        CGO_ENABLED: '0',
      },
    }
  )
  return stdout
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith('..' + path.sep) &&
      !path.isAbsolute(relative))
  )
}

/** The nearest go.mod directory from `dir` up to `rootDir`, like Turbopack. */
function ancestorModule(dir: string, rootDir: string): string | undefined {
  let current = dir
  while (true) {
    if (existsSync(path.join(current, 'go.mod'))) return current
    if (current === rootDir || !isInside(rootDir, current)) return undefined
    const parent = path.dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/**
 * Finds the Go package directories in the project, and the modules nested in
 * it. Skips what Go's `./...` skips (`.` and `_` prefixes, `testdata`), plus
 * `node_modules`, `vendor`, the build output, and symlinks, which Turbopack
 * rejects as Go sources.
 */
async function scanProject(
  dir: string,
  distDir: string | undefined
): Promise<{ packages: string[]; modules: string[] }> {
  const packages: string[] = []
  const modules: string[] = []
  const pending = [dir]
  while (pending.length) {
    const current = pending.pop()!
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    let hasGo = false
    for (const entry of entries) {
      const { name } = entry
      if (entry.isFile()) {
        if (name === 'go.mod' && current !== dir) modules.push(current)
        if (name.endsWith('.go')) hasGo = true
      } else if (
        entry.isDirectory() &&
        !name.startsWith('.') &&
        !name.startsWith('_') &&
        name !== 'node_modules' &&
        name !== 'vendor' &&
        name !== 'testdata'
      ) {
        const child = path.join(current, name)
        if (child !== distDir) pending.push(child)
      }
    }
    if (hasGo) packages.push(current)
  }
  return { packages, modules }
}

// Characters Go accepts in import path elements. Route directories such as
// `[id]` and `(group)` fall outside them.
const IMPORT_PATH = /^[A-Za-z0-9._~/+-]*$/

const LIST = ['list', '-e', '-mod=readonly', '-deps', '-f', '{{.ImportPath}}']

/** Whether any of the packages, their tests, or their dependencies import the SDK. */
async function importsSdk(
  moduleDir: string,
  packages: string[]
): Promise<boolean> {
  const patterns: string[] = []
  const byFiles: string[] = []
  for (const pkg of packages) {
    const relative = path.relative(moduleDir, pkg).split(path.sep).join('/')
    if (IMPORT_PATH.test(relative)) {
      patterns.push(relative ? `./${relative}` : '.')
    } else {
      byFiles.push(pkg)
    }
  }
  // -e reports packages that fail to load, including the SDK while its
  // requirement is still missing, instead of failing the whole listing.
  const outputs: string[] = []
  if (patterns.length) {
    outputs.push(await go(moduleDir, [...LIST, '-test', ...patterns]))
  }
  // A directory that is not a valid import path cannot be named as a package,
  // so list its files instead, like Turbopack compiles it.
  for (const pkg of byFiles) {
    const files = (await fs.readdir(pkg)).filter(
      (name) =>
        name.endsWith('.go') &&
        !name.endsWith('_test.go') &&
        !name.startsWith('.') &&
        !name.startsWith('_')
    )
    if (files.length) outputs.push(await go(pkg, [...LIST, ...files]))
  }
  return outputs.some((output) =>
    output.split('\n').some((line) => {
      // Test variants are listed as "path [pkg.test]".
      const importPath = line.split(' ')[0]
      return (
        importPath === GO_SDK_MODULE ||
        importPath.startsWith(`${GO_SDK_MODULE}/`)
      )
    })
  )
}

/** Go requires a ./ or ../ prefix for directory replacements. */
function replacementPath(moduleDir: string, sdkDir: string): string {
  const relative = path.relative(moduleDir, sdkDir).split(path.sep).join('/')
  return relative === '..' || relative.startsWith('../')
    ? relative
    : `./${relative}`
}

async function ensureModule(
  moduleDir: string,
  packages: string[],
  sdkDir: string
): Promise<void> {
  const goMod: GoMod = JSON.parse(await go(moduleDir, ['mod', 'edit', '-json']))
  const replacement = goMod.Replace?.find(
    ({ Old }) => Old.Path === GO_SDK_MODULE && !Old.Version
  )
  const versioned = (goMod.Replace ?? []).filter(
    ({ Old }) => Old.Path === GO_SDK_MODULE && Old.Version
  )
  // A path-wide directory replacement applies to every required version, so
  // libraries that import the SDK resolve to the same installed copy.
  // Version-specific replacements would take precedence over it.
  const mapped =
    replacement !== undefined &&
    !replacement.New.Version &&
    path.resolve(moduleDir, replacement.New.Path) === sdkDir &&
    versioned.length === 0
  const required = goMod.Require?.some(({ Path }) => Path === GO_SDK_MODULE)
  // Only add the requirement when the SDK is imported. `go mod tidy` removes an
  // unused one, and adding it back on every start would fight it.
  const require = !required && (await importsSdk(moduleDir, packages))
  if (mapped && !require) return

  const target = replacementPath(moduleDir, sdkDir)
  const args = ['mod', 'edit']
  if (require) args.push(`-require=${GO_SDK_MODULE}@${GO_SDK_VERSION}`)
  if (!mapped) {
    for (const { Old } of versioned) {
      args.push(`-dropreplace=${GO_SDK_MODULE}@${Old.Version}`)
    }
    args.push(`-replace=${GO_SDK_MODULE}=${target}`)
  }
  await go(moduleDir, args)

  const changes = [
    require && `added "require ${GO_SDK_MODULE} ${GO_SDK_VERSION}"`,
    !mapped && `mapped ${GO_SDK_MODULE} to ${target}`,
  ].filter(Boolean)
  Log.info(
    `Updated ${path.join(moduleDir, 'go.mod')} (${changes.join(', ')}) so Go tools resolve the Next.js Go SDK from the installed next package.`
  )
}

/**
 * `next dev` and `next build`: map `next/go` to the installed SDK in every Go
 * module that holds the project's Go sources, like TypeScript setup
 * reconfigures tsconfig.json.
 *
 * - The directory replacement is always kept current. It is harmless when the
 *   SDK is unused, and with pnpm its path changes when Next.js is upgraded.
 * - The requirement is added only when the SDK is imported, because Go ignores
 *   a replacement for a module that is not required. It is never removed;
 *   `go mod tidy` does that.
 *
 * Never throws: failures are logged, and Go reports any remaining problem when
 * the handler is compiled.
 */
export async function ensureGoSdk(options: GoSdkOptions): Promise<void> {
  try {
    // Turbopack rejects Go sources reached through symlinks, such as pnpm's
    // node_modules/next, so work with real paths throughout.
    const dir = realpathSync(options.dir)
    const rootDir = realpathSync(options.rootDir)
    const distDir =
      options.distDir && existsSync(options.distDir)
        ? realpathSync(options.distDir)
        : options.distDir
    const sdkDir = realpathSync(options.sdkDir ?? defaultSdkDirectory())

    const { packages, modules: nested } = await scanProject(dir, distDir)
    const ancestor = ancestorModule(dir, rootDir)
    const modules = [...nested, ...(ancestor ? [ancestor] : [])]
    // Assign each package to its nearest module, as Go does.
    const packagesByModule = new Map<string, string[]>()
    for (const pkg of packages) {
      const owner = modules
        .filter((moduleDir) => isInside(moduleDir, pkg))
        .sort((a, b) => b.length - a.length)[0]
      if (!owner) continue
      packagesByModule.set(owner, [...(packagesByModule.get(owner) ?? []), pkg])
    }
    if (packagesByModule.size === 0) return

    if (!isInside(rootDir, sdkDir)) {
      // Turbopack only compiles directory replacements inside its root.
      Log.warn(
        `The installed next package (${sdkDir}) is outside the project root (${rootDir}), so ${GO_SDK_MODULE} cannot be mapped in go.mod. Set turbopack.root to a directory that contains it.`
      )
      return
    }
    for (const [moduleDir, modulePackages] of packagesByModule) {
      try {
        await ensureModule(moduleDir, modulePackages, sdkDir)
      } catch (error) {
        Log.warn(
          `Could not map ${GO_SDK_MODULE} to the installed Next.js in ${path.join(moduleDir, 'go.mod')}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  } catch (error) {
    Log.warn(
      `Could not map ${GO_SDK_MODULE} to the installed Next.js: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

let queue: Promise<void> = Promise.resolve()

/**
 * Like `ensureGoSdk`, but serialized, so the dev server can call it whenever Go
 * sources change without concurrent `go mod edit` runs.
 */
export function ensureGoSdkQueued(options: GoSdkOptions): Promise<void> {
  queue = queue.then(() => ensureGoSdk(options))
  return queue
}
