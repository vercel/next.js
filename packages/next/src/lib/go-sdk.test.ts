import { execFileSync, spawnSync } from 'child_process'
import { mkdtempSync } from 'fs'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'fs/promises'
import * as os from 'os'
import { dirname, join } from 'path'
import * as Log from '../build/output/log'
import { ensureGoSdk } from './go-sdk'

jest.mock('../build/output/log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
}))

// The first Go build compiles the standard library into a cold cache.
jest.setTimeout(120_000)

const go = process.env.TURBOPACK_GO || 'go'
const hasGo = spawnSync(go, ['version']).status === 0
// The real SDK sources, so the fixtures compile against what ships.
const SDK_SOURCE = join(__dirname, '../../go')

const PROXY = `package main

import (
\t"net/http"
\t"next/go"
)

func Proxy(w http.ResponseWriter, r *http.Request) { next.Next(w) }

func main() { http.HandleFunc("/", Proxy) }
`
const PLAIN = `package main

func main() {}
`

const temporaryDirectories: string[] = []

async function temporaryDirectory() {
  const directory = await mkdtemp(join(os.tmpdir(), 'next-go-sdk-'))
  temporaryDirectories.push(directory)
  return realpath(directory)
}

async function write(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

async function writeModule(directory: string, name: string) {
  await write(join(directory, 'go.mod'), `module ${name}\n\ngo 1.24.0\n`)
}

/**
 * Installs next like pnpm: the package lives in a versioned directory under
 * node_modules/.pnpm, and node_modules/next is a symlink to it. Returns the
 * real SDK directory.
 */
async function installNext(root: string, version: string) {
  const pkg = join(root, `node_modules/.pnpm/next@${version}/node_modules/next`)
  await cp(SDK_SOURCE, join(pkg, 'go'), { recursive: true })
  const link = join(root, 'node_modules/next')
  await rm(link, { force: true })
  await symlink(pkg, link)
  return join(pkg, 'go')
}

function goMod(directory: string) {
  return readFile(join(directory, 'go.mod'), 'utf8')
}

/** Builds the package in `directory`, or the named files in it. */
function build(directory: string, files: string[] = ['.']) {
  // Windows cannot write a build output to os.devNull. An existing directory
  // receives the executable instead.
  const output = mkdtempSync(join(os.tmpdir(), 'next-go-sdk-build-'))
  temporaryDirectories.push(output)
  execFileSync(go, ['build', '-mod=readonly', '-o', output, ...files], {
    cwd: directory,
    env: {
      ...process.env,
      GOWORK: 'off',
      GOFLAGS: '',
      GOPROXY: 'off',
      GOTOOLCHAIN: 'local',
    },
    stdio: 'pipe',
  })
}

afterEach(async () => {
  jest.mocked(Log.info).mockClear()
  jest.mocked(Log.warn).mockClear()
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})
;(hasGo ? describe : describe.skip)('ensureGoSdk', () => {
  it('adds the requirement and the replacement when next/go is imported', async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'proxy.go'), PROXY)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    const content = await goMod(dir)
    expect(content).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(content).toContain(
      'replace next/go => ./node_modules/.pnpm/next@16.0.0/node_modules/next/go'
    )
    expect(() => build(dir)).not.toThrow()

    // Idempotent: nothing to change, nothing logged.
    jest.mocked(Log.info).mockClear()
    await ensureGoSdk({ dir, rootDir: dir, sdkDir })
    expect(await goMod(dir)).toBe(content)
    expect(Log.info).not.toHaveBeenCalled()
  })

  it('detects imports through local packages', async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(
      join(dir, 'internal/mw/mw.go'),
      `package mw\n\nimport (\n\t"net/http"\n\t"next/go"\n)\n\nfunc Continue(w http.ResponseWriter) { next.Next(w) }\n`
    )
    await write(
      join(dir, 'proxy.go'),
      `package main\n\nimport "example.com/app/internal/mw"\n\nvar _ = mw.Continue\n\nfunc main() {}\n`
    )
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(() => build(dir)).not.toThrow()
  })

  it('detects imports in route directories that are not import paths', async () => {
    // `[id]` and `(group)` are not valid in Go import paths, so these packages
    // cannot be listed by pattern.
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    const route = join(dir, 'app/(group)/items/[id]')
    await write(
      join(route, 'route.go'),
      `package main\n\nimport (\n\t"net/http"\n\t"next/go"\n)\n\nfunc GET(w http.ResponseWriter, r *http.Request) { next.Next(w) }\n\nfunc main() {}\n`
    )
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(() => build(route, ['route.go'])).not.toThrow()
  })

  it('does not add the requirement when next/go is not imported', async () => {
    // `go mod tidy` removes an unused requirement; adding it back on every
    // start would fight it.
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'app/api/route.go'), PLAIN)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    const content = await goMod(dir)
    expect(content).not.toMatch(/^require next\/go/m)
    expect(content).toMatch(/^replace next\/go => /m)

    // Importing it later adds the requirement.
    await write(join(dir, 'proxy.go'), PROXY)
    await rm(join(dir, 'app'), { recursive: true })
    await ensureGoSdk({ dir, rootDir: dir, sdkDir })
    expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(() => build(dir)).not.toThrow()
  })

  it('keeps a requirement written by go mod tidy', async () => {
    const dir = await temporaryDirectory()
    await write(
      join(dir, 'go.mod'),
      'module example.com/app\n\ngo 1.24.0\n\nrequire next/go v0.0.0-00010101000000-000000000000\n'
    )
    await write(join(dir, 'proxy.go'), PROXY)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    const content = await goMod(dir)
    expect(content).toContain(
      'require next/go v0.0.0-00010101000000-000000000000'
    )
    expect(content).not.toMatch(/^require next\/go v0\.0\.0$/m)
    expect(() => build(dir)).not.toThrow()
  })

  it('follows pnpm to the new directory when next is upgraded', async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'proxy.go'), PROXY)
    const first = await installNext(dir, '16.0.0')
    await ensureGoSdk({ dir, rootDir: dir, sdkDir: first })
    expect(() => build(dir)).not.toThrow()

    // The package manager removes the old version on upgrade.
    const second = await installNext(dir, '16.1.0')
    await rm(join(dir, 'node_modules/.pnpm/next@16.0.0'), { recursive: true })
    expect(() => build(dir)).toThrow()

    await ensureGoSdk({ dir, rootDir: dir, sdkDir: second })

    const content = await goMod(dir)
    expect(content).toContain(
      'replace next/go => ./node_modules/.pnpm/next@16.1.0/node_modules/next/go'
    )
    expect(content).not.toContain('next@16.0.0')
    expect(content.match(/^require next\/go/gm)).toHaveLength(1)
    expect(() => build(dir)).not.toThrow()
  })

  it('replaces a version-specific replacement, which would take precedence', async () => {
    const dir = await temporaryDirectory()
    await write(
      join(dir, 'go.mod'),
      'module example.com/app\n\ngo 1.24.0\n\nrequire next/go v0.0.0\n\nreplace next/go v0.0.0 => ./elsewhere\n'
    )
    await write(join(dir, 'proxy.go'), PROXY)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    const content = await goMod(dir)
    expect(content).not.toContain('elsewhere')
    expect(() => build(dir)).not.toThrow()
  })

  it('maps the SDK hoisted to the workspace root in an application module', async () => {
    const root = await temporaryDirectory()
    const dir = join(root, 'apps/web')
    await writeModule(dir, 'example.com/web')
    await write(join(dir, 'proxy.go'), PROXY)
    const sdkDir = await installNext(root, '16.0.0')

    await ensureGoSdk({ dir, rootDir: root, sdkDir })

    const content = await goMod(dir)
    expect(content).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(content).toContain(
      'replace next/go => ../../node_modules/.pnpm/next@16.0.0/node_modules/next/go'
    )
    expect(() => build(dir)).not.toThrow()
  })

  it('maps the SDK in a module at the workspace root', async () => {
    const root = await temporaryDirectory()
    const dir = join(root, 'apps/web')
    await writeModule(root, 'example.com/monorepo')
    await write(join(dir, 'src/proxy.go'), PROXY)
    const sdkDir = await installNext(root, '16.0.0')

    await ensureGoSdk({ dir, rootDir: root, sdkDir })

    const content = await goMod(root)
    expect(content).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(content).toContain(
      'replace next/go => ./node_modules/.pnpm/next@16.0.0/node_modules/next/go'
    )
    expect(() => build(join(dir, 'src'))).not.toThrow()
  })

  it('maps modules nested in the project', async () => {
    const dir = await temporaryDirectory()
    const nested = join(dir, 'app/api/items')
    await writeModule(nested, 'example.com/items')
    await write(join(nested, 'route.go'), PROXY)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    const content = await goMod(nested)
    expect(content).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(content).toContain(
      'replace next/go => ../../../node_modules/.pnpm/next@16.0.0/node_modules/next/go'
    )
    expect(() => build(nested)).not.toThrow()
  })

  it('skips Go sources in node_modules and the build output', async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'app/api/route.go'), PLAIN)
    await write(join(dir, 'node_modules/some-package/main.go'), PROXY)
    await write(join(dir, 'build/server/main.go'), PROXY)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({
      dir,
      rootDir: dir,
      distDir: join(dir, 'build'),
      sdkDir,
    })

    expect(await goMod(dir)).not.toMatch(/^require next\/go/m)
  })

  it('warns and leaves go.mod alone when next is outside the root', async () => {
    const root = await temporaryDirectory()
    const outside = await temporaryDirectory()
    const dir = join(root, 'apps/web')
    await writeModule(dir, 'example.com/web')
    await write(join(dir, 'proxy.go'), PROXY)
    const sdkDir = await installNext(outside, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(await goMod(dir)).toBe('module example.com/web\n\ngo 1.24.0\n')
    expect(Log.warn).toHaveBeenCalledWith(
      expect.stringContaining('outside the project root')
    )
  })

  it('does nothing without a Go module', async () => {
    const dir = await temporaryDirectory()
    await write(join(dir, 'proxy.go'), PROXY)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(Log.info).not.toHaveBeenCalled()
    expect(Log.warn).not.toHaveBeenCalled()
  })
})
