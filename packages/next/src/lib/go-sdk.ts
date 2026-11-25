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
  // Like the compiler, inherit only OS/toolchain locations and explicit cache
  // settings. GOPRIVATE and GONOPROXY can bypass GOPROXY=off; GO111MODULE,
  // GOFLAGS, cross-compilation flags, and the user's go env file can also
  // change discovery independently of the compilation that follows it.
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV,
    GOENV: 'off',
    GO111MODULE: 'on',
    GOWORK: 'off',
    GOFLAGS: '',
    GOPROXY: 'off',
    GOSUMDB: 'off',
    GOVCS: '*:off',
    GOTOOLCHAIN: 'local',
    GOTELEMETRY: 'off',
    CGO_ENABLED: '0',
  }
  for (const name of [
    'PATH',
    'HOME',
    'XDG_CACHE_HOME',
    'USERPROFILE',
    'LOCALAPPDATA',
    'APPDATA',
    'SystemRoot',
    'TEMP',
    'TMP',
    'TMPDIR',
    'GOROOT',
    'GOCACHE',
    'GOMODCACHE',
    'GOPATH',
  ]) {
    if (process.env[name] !== undefined) env[name] = process.env[name]
  }
  const { stdout } = await execFileAsync(
    process.env.TURBOPACK_GO || 'go',
    args,
    {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      env,
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
 * Find project packages and modules, including actual Go entries in route
 * directories that Go's wildcard patterns ignore. Unused testdata/vendor
 * fixtures must not cause their modules to be edited.
 */
async function scanProject(
  dir: string,
  distDir: string | undefined
): Promise<{
  packages: string[]
  modules: string[]
  handlers: Set<string>
}> {
  const packages: string[] = []
  const modules: string[] = []
  const handlers = new Set<string>()
  const srcDir = path.join(dir, 'src')
  const rootAppDir = path.join(dir, 'app')
  const appDir = existsSync(rootAppDir) ? rootAppDir : path.join(srcDir, 'app')
  const pending = [{ directory: dir, ignoredByGo: false }]
  while (pending.length) {
    const { directory: current, ignoredByGo } = pending.pop()!
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    const isModuleRoot = entries.some(
      (entry) => entry.isFile() && entry.name === 'go.mod'
    )
    const isHandler = entries.some(
      (entry) =>
        entry.isFile() &&
        ((entry.name === 'route.go' && isInside(appDir, current)) ||
          (entry.name === 'proxy.go' &&
            (current === dir || current === srcDir)))
    )
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
        name !== 'node_modules'
      ) {
        const child = path.join(current, name)
        const childIgnored =
          ignoredByGo ||
          name === 'testdata' ||
          (name === 'vendor' && isModuleRoot) ||
          path.basename(current) === 'vendor'
        if (child === distDir || (childIgnored && !isInside(appDir, child))) {
          continue
        }
        pending.push({ directory: child, ignoredByGo: childIgnored })
      }
    }
    if (hasGo && (!ignoredByGo || isHandler)) packages.push(current)
    if (isHandler) handlers.add(current)
  }
  return { packages, modules, handlers }
}

// Quickly route directories such as `[id]` and `(group)` to named-file listing.
// Go also rejects some names using only these characters; let go list report
// those below rather than duplicating its import-path validation rules.
const IMPORT_PATH = /^[A-Za-z0-9._~/+-]*$/

const LIST = [
  'list',
  '-e',
  '-mod=readonly',
  '-deps',
  '-f',
  // A package with no directory failed to load. Prefix its matching command
  // patterns with ! so the caller can retry those directories by filename.
  '{{.ImportPath}}{{if not .Dir}}{{range .Match}}\n!{{.}}{{end}}{{end}}',
]

/** Whether any of the packages, their tests, or their dependencies import the SDK. */
async function importsSdk(
  moduleDir: string,
  packages: string[],
  handlers: Set<string>
): Promise<boolean> {
  const patterns: string[] = []
  const byFiles = new Set<string>()
  for (const pkg of packages) {
    const relative = path.relative(moduleDir, pkg).split(path.sep).join('/')
    if (IMPORT_PATH.test(relative)) {
      patterns.push(relative ? `./${relative}` : '.')
    } else {
      byFiles.add(pkg)
    }
    // Turbopack compiles a handler's regular non-test files by name, ignoring
    // build tags and platform suffixes. Inspect that same selection even when
    // package-mode listing succeeds but omits one of those source files.
    if (handlers.has(pkg)) byFiles.add(pkg)
  }
  // -e reports packages that fail to load, including the SDK while its
  // requirement is still missing, instead of failing the whole listing.
  const outputs: string[] = []
  if (patterns.length) {
    const output = await go(moduleDir, [...LIST, '-test', ...patterns])
    outputs.push(output)
    for (const line of output.split('\n')) {
      if (!line.startsWith('!')) continue
      // Only retry a directory we scanned, never a dependency's reported path.
      const pkg = path.resolve(moduleDir, line.slice(1))
      if (packages.includes(pkg)) byFiles.add(pkg)
    }
  }
  // A directory that is not a valid import path cannot be named as a package,
  // so list its files instead, like Turbopack compiles it.
  for (const pkg of byFiles) {
    const files = (await fs.readdir(pkg, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.go') &&
          !entry.name.endsWith('_test.go')
      )
      .map((entry) => entry.name)
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
  sdkDir: string,
  handlers: Set<string>
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
  const require = !required && (await importsSdk(moduleDir, packages, handlers))
  // Go ignores a replacement for a module that is not required, so leave the
  // go.mod of a module that does not use the SDK, such as a Go service that
  // lives in the project directory, untouched.
  if (!required && !require) return
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

// Matches an import spec for the SDK, alone or in an import block, with or
// without a package name: `"next/go"`, `next "next/go"`, `import "next/go"`.
const SDK_IMPORT = /^\s*(?:import\s+)?(?:[\w.]+\s+)?"next\/go(?:\/[^"]*)?"\s*$/m

/** The Go files in `pkg` that import the SDK, by a source scan. */
async function filesImportingSdk(pkg: string): Promise<string[]> {
  const files: string[] = []
  for (const name of await fs.readdir(pkg)) {
    if (!name.endsWith('.go') || name.startsWith('.') || name.startsWith('_')) {
      continue
    }
    try {
      if (SDK_IMPORT.test(await fs.readFile(path.join(pkg, name), 'utf8'))) {
        files.push(path.join(pkg, name))
      }
    } catch {}
  }
  return files
}

// Packages already warned about, so the dev server, which runs this on every
// Go change, warns once per package.
const warnedWithoutModule = new Set<string>()

/**
 * Go only resolves `next/go` through a `go.mod` replacement, so a package that
 * imports it outside any module fails to compile with "package next/go is not
 * in std". Explain why instead.
 */
async function warnImportsWithoutModule(
  packages: string[],
  dir: string
): Promise<void> {
  for (const pkg of packages) {
    if (warnedWithoutModule.has(pkg)) continue
    const files = await filesImportingSdk(pkg)
    if (files.length === 0) continue
    warnedWithoutModule.add(pkg)
    const names = files.map((file) => path.relative(dir, file)).join(', ')
    Log.warn(
      `${names} imports ${GO_SDK_MODULE}, but is not in a Go module, so Go cannot resolve it. Create a go.mod in the project (for example with "go mod init example.com/app"), then run next dev or next build again to map ${GO_SDK_MODULE} in it.`
    )
  }
}

/**
 * `next dev` and `next build`: map `next/go` to the installed SDK in every Go
 * module that holds the project's Go sources and uses the SDK, like TypeScript
 * setup reconfigures tsconfig.json.
 *
 * - Modules that neither require nor import the SDK are left untouched, because
 *   Go ignores a replacement for a module that is not required.
 * - The requirement is added only when the SDK is imported. It is never
 *   removed; `go mod tidy` does that.
 * - The directory replacement is kept current while the SDK is required. With
 *   pnpm its path changes when Next.js is upgraded.
 * - Packages that import the SDK outside any module get a warning, since Go
 *   cannot resolve it there.
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

    const {
      packages,
      modules: nested,
      handlers,
    } = await scanProject(dir, distDir)
    const ancestor = ancestorModule(dir, rootDir)
    const modules = [...nested, ...(ancestor ? [ancestor] : [])]
    // Assign each package to its nearest module, as Go does.
    const packagesByModule = new Map<string, string[]>()
    const withoutModule: string[] = []
    for (const pkg of packages) {
      const owner = modules
        .filter((moduleDir) => isInside(moduleDir, pkg))
        .sort((a, b) => b.length - a.length)[0]
      if (!owner) {
        withoutModule.push(pkg)
        continue
      }
      packagesByModule.set(owner, [...(packagesByModule.get(owner) ?? []), pkg])
    }
    if (withoutModule.length) await warnImportsWithoutModule(withoutModule, dir)
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
        await ensureModule(moduleDir, modulePackages, sdkDir, handlers)
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
let pending: Promise<void> | undefined

/**
 * Like `ensureGoSdk`, but serialized, so the dev server can call it whenever Go
 * sources change without concurrent `go mod edit` runs.
 */
export function ensureGoSdkQueued(options: GoSdkOptions): Promise<void> {
  // Calls made while a run is waiting to start share it: it reads the files
  // when it starts, so it covers every change made before then. The dev server
  // calls this for each recompiled Go endpoint, often several at once.
  if (pending) return pending
  const run = queue.then(() => {
    pending = undefined
    return ensureGoSdk(options)
  })
  pending = run
  queue = run
  return run
}

/** The SDK options for a Next.js project, as `next dev` and `next build` use them. */
export function goSdkOptions(
  dir: string,
  distDir: string,
  nextConfig: {
    turbopack?: { root?: string }
    outputFileTracingRoot?: string
  }
): GoSdkOptions {
  return {
    dir,
    rootDir:
      nextConfig.turbopack?.root || nextConfig.outputFileTracingRoot || dir,
    distDir,
  }
}
