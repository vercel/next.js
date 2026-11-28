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
import { delimiter, dirname, join } from 'path'
import * as Log from '../build/output/log'
import { ensureGoSdk, ensureGoSdkQueued } from './go-sdk'

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
\t"next/go/proxy"
)

func Proxy(w http.ResponseWriter, r *http.Request) { proxy.Next(w) }

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

async function writeModule(
  directory: string,
  name: string,
  goVersion = '1.24.0'
) {
  await write(join(directory, 'go.mod'), `module ${name}\n\ngo ${goVersion}\n`)
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

  it('maps the same module for an assets-only import', async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app', '1.21')
    await write(
      join(dir, 'app/api/route.go'),
      `package main\n\nimport "next/go/assets"\n\nvar client = assets.Browser("app/client.ts")\n\nfunc main() {}\n`
    )
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(await goMod(dir)).not.toMatch(/require next\/go\/(assets|proxy)/)
    expect(() => build(join(dir, 'app/api'), ['route.go'])).not.toThrow()
  })

  it('detects imports through local packages', async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(
      join(dir, 'internal/mw/mw.go'),
      `package mw\n\nimport (\n\t"net/http"\n\t"next/go/proxy"\n)\n\nfunc Continue(w http.ResponseWriter) { proxy.Next(w) }\n`
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
      `package main\n\nimport (\n\t"net/http"\n\t"next/go/proxy"\n)\n\nfunc GET(w http.ResponseWriter, r *http.Request) { proxy.Next(w) }\n\nfunc main() {}\n`
    )
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(() => build(route, ['route.go'])).not.toThrow()
  })

  // These names cannot be created on Windows, but Go rejects them as package
  // paths on every platform. Turbopack still compiles their named source files.
  ;(process.platform === 'win32' ? describe.skip : describe)(
    'Go import-path restrictions',
    () => {
      it.each([
        'aux',
        'con',
        'nul',
        'prn',
        'com1',
        'lpt1',
        'AUX.txt',
        'trailing.',
      ])(
        'detects imports when Go rejects the route directory %s',
        async (folder) => {
          const dir = await temporaryDirectory()
          await writeModule(dir, 'example.com/app')
          const route = join(dir, 'app', folder)
          await write(join(route, 'route.go'), PROXY)
          const sdkDir = await installNext(dir, '16.0.0')

          await ensureGoSdk({ dir, rootDir: dir, sdkDir })

          expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
          expect(() => build(route, ['route.go'])).not.toThrow()
        }
      )
    }
  )

  it.each(['proxy.go', 'app/api/route.go'])(
    'inspects explicitly selected build-tagged source %s',
    async (entry) => {
      const dir = await temporaryDirectory()
      await writeModule(dir, 'example.com/app')
      const file = join(dir, entry)
      await write(file, `//go:build next_sdk_custom\n\n${PROXY}`)
      const sdkDir = await installNext(dir, '16.0.0')

      await ensureGoSdk({ dir, rootDir: dir, sdkDir })

      expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
      expect(() =>
        build(dirname(file), [entry.split('/').pop()!])
      ).not.toThrow()
    }
  )

  it('inspects platform-suffixed siblings selected by the native compiler', async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'proxy.go'), PLAIN)
    await write(
      join(dir, 'helper_plan9.go'),
      'package main\n\nimport "next/go/proxy"\n\nvar _ = proxy.Next\n'
    )
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(() => build(dir, ['proxy.go', 'helper_plan9.go'])).not.toThrow()
  })

  it('keeps package-mode selection for ordinary Go dependencies', async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'proxy.go'), PLAIN)
    await write(join(dir, 'internal/library/value.go'), 'package library\n')
    await write(
      join(dir, 'internal/library/value_plan9.go'),
      'package library\n\nimport "next/go/proxy"\n\nvar _ = proxy.Next\n'
    )
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(await goMod(dir)).not.toMatch(/next\/go/)
  })

  it.each(['testdata', 'vendor/nested'])(
    'sets up actual route.go files under %s without scanning fixture modules',
    async (folder) => {
      const dir = await temporaryDirectory()
      await writeModule(dir, 'example.com/app')
      const route = join(dir, 'app', folder)
      await write(join(route, 'route.go'), PROXY)
      // This is not a route and must never be passed to go mod edit.
      await write(
        join(dir, 'app/testdata/unused/go.mod'),
        'invalid module fixture'
      )
      await write(join(dir, 'app/testdata/unused/helper.go'), PROXY)
      const sdkDir = await installNext(dir, '16.0.0')

      await ensureGoSdk({ dir, rootDir: dir, sdkDir })

      expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
      expect(Log.warn).not.toHaveBeenCalled()
      expect(() => build(route, ['route.go'])).not.toThrow()
    }
  )

  it('ignores ambient Go module, workspace and build-flag settings', async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'proxy.go'), PROXY)
    const sdkDir = await installNext(dir, '16.0.0')
    const configDir = await temporaryDirectory()
    const goEnvFile = join(configDir, 'go-env')
    await write(goEnvFile, 'GO111MODULE=off\nGOFLAGS=-mod=vendor\n')
    const overrides = {
      GOENV: goEnvFile,
      GO111MODULE: 'off',
      GOWORK: join(configDir, 'missing.work'),
      GOFLAGS: '-mod=vendor',
      GOOS: 'js',
      GOARCH: 'wasm',
    }
    const previous = Object.fromEntries(
      Object.keys(overrides).map((key) => [key, process.env[key]])
    )
    try {
      Object.assign(process.env, overrides)
      await ensureGoSdk({ dir, rootDir: dir, sdkDir })
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }

    expect(Log.warn).not.toHaveBeenCalled()
    expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(() => build(dir)).not.toThrow()
  })
  ;(process.platform === 'linux' ? describe : describe.skip)(
    'Linux cache locations',
    () => {
      it('preserves XDG_CACHE_HOME when the home directory cannot hold a Go cache', async () => {
        const dir = await temporaryDirectory()
        await writeModule(dir, 'example.com/app')
        await write(join(dir, 'proxy.go'), PROXY)
        const sdkDir = await installNext(dir, '16.0.0')
        const outside = await temporaryDirectory()
        const unavailableHome = join(outside, 'unavailable-home')
        await write(unavailableHome, 'not a directory')
        const overrides = {
          HOME: unavailableHome,
          XDG_CACHE_HOME: join(outside, 'cache'),
          GOCACHE: '',
          GOMODCACHE: join(outside, 'modules'),
        }
        const previous = Object.fromEntries(
          Object.keys(overrides).map((key) => [key, process.env[key]])
        )
        try {
          Object.assign(process.env, overrides)
          await ensureGoSdk({ dir, rootDir: dir, sdkDir })
        } finally {
          for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
          }
        }

        expect(Log.warn).not.toHaveBeenCalled()
        expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
        expect(() => build(dir)).not.toThrow()
      })
    }
  )

  it('never invokes VCS for uncached private dependencies during SDK discovery', async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'proxy.go'), PROXY)
    await write(
      join(dir, 'private.go'),
      'package main\n\nimport _ "github.com/next-sdk-offline-fixture/private"\n'
    )
    await write(
      join(dir, 'go.mod'),
      (await goMod(dir)) +
        '\nrequire github.com/next-sdk-offline-fixture/private v1.0.0\n'
    )
    // Without sum entries, -mod=readonly stops at a missing-checksum error
    // before reaching VCS, making this a false-green network regression test.
    // Synthetic sums are enough to reach the failing fake Git below; nothing
    // is downloaded or checksum-validated.
    const checksum = 'h1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
    await write(
      join(dir, 'go.sum'),
      `github.com/next-sdk-offline-fixture/private v1.0.0 ${checksum}\n` +
        `github.com/next-sdk-offline-fixture/private v1.0.0/go.mod ${checksum}\n`
    )
    const sdkDir = await installNext(dir, '16.0.0')
    const outside = await temporaryDirectory()
    const marker = join(outside, 'git-invoked')
    const gitSource = join(outside, 'fake-git.go')
    const gitBinary = join(
      outside,
      process.platform === 'win32' ? 'git.exe' : 'git'
    )
    await write(
      gitSource,
      `package main\nimport "os"\nfunc main() { os.WriteFile(${JSON.stringify(marker)}, []byte("invoked"), 0600); os.Exit(1) }\n`
    )
    execFileSync(go, ['build', '-o', gitBinary, gitSource], { stdio: 'pipe' })
    const overrides = {
      PATH: `${outside}${delimiter}${process.env.PATH ?? ''}`,
      GOPRIVATE: 'github.com/next-sdk-offline-fixture/*',
      GONOPROXY: '*',
      GOSUMDB: 'off',
      GOVCS: '*:all',
      GOMODCACHE: join(outside, 'modcache'),
    }
    const previous = Object.fromEntries(
      Object.keys(overrides).map((key) => [key, process.env[key]])
    )
    try {
      Object.assign(process.env, overrides)
      await ensureGoSdk({ dir, rootDir: dir, sdkDir })
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }

    await expect(readFile(marker, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(Log.warn).not.toHaveBeenCalled()
    expect(await goMod(dir)).toMatch(/^\s*next\/go v0\.0\.0$/m)
  })

  it('lets modules that declare an older go version require the SDK', async () => {
    // -mod=readonly refuses to raise the go line, so the SDK must not declare
    // a newer one than the application.
    for (const goVersion of ['1.21', '1.22', '1.23.0']) {
      const dir = await temporaryDirectory()
      await writeModule(dir, 'example.com/app', goVersion)
      await write(join(dir, 'proxy.go'), PROXY)
      const sdkDir = await installNext(dir, '16.0.0')

      await ensureGoSdk({ dir, rootDir: dir, sdkDir })

      const content = await goMod(dir)
      expect(content).toMatch(/^require next\/go v0\.0\.0$/m)
      expect(content).toContain(`go ${goVersion}\n`)
      expect(() => build(dir)).not.toThrow()
    }
  })

  it.each(['vendor'])(
    'detects imports in a route folder named %s',
    async (folder) => {
      // Go gives vendor a meaning only at a module root.
      const dir = await temporaryDirectory()
      await writeModule(dir, 'example.com/app')
      const route = join(dir, 'app', folder)
      await write(
        join(route, 'route.go'),
        `package main\n\nimport (\n\t"net/http"\n\t"next/go/proxy"\n)\n\nfunc GET(w http.ResponseWriter, r *http.Request) { proxy.Next(w) }\n\nfunc main() {}\n`
      )
      const sdkDir = await installNext(dir, '16.0.0')

      await ensureGoSdk({ dir, rootDir: dir, sdkDir })

      expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
      expect(() => build(route, ['route.go'])).not.toThrow()
    }
  )

  it('skips testdata like go mod tidy', async () => {
    // A requirement only testdata needs would be removed by go mod tidy.
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'app/api/route.go'), PLAIN)
    await write(join(dir, 'app/testdata/fixture/main.go'), PROXY)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(await goMod(dir)).not.toMatch(/next\/go/)
  })

  it("skips a module's vendor directory", async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'app/api/route.go'), PLAIN)
    await write(join(dir, 'vendor/example.com/lib/lib.go'), PROXY)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(await goMod(dir)).not.toMatch(/next\/go/)
  })

  it('shares a queued run between calls made before it starts', async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'proxy.go'), PROXY)
    const sdkDir = await installNext(dir, '16.0.0')
    const options = { dir, rootDir: dir, sdkDir }

    const first = ensureGoSdkQueued(options)
    const second = ensureGoSdkQueued(options)
    expect(second).toBe(first)
    await first
    expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)

    // Once a run has started, a new call queues another one.
    const third = ensureGoSdkQueued(options)
    expect(third).not.toBe(first)
    await third
  })

  it('leaves go.mod alone when next/go is not imported', async () => {
    // `go mod tidy` removes an unused requirement; adding it back on every
    // start would fight it. Without the requirement Go ignores a replacement,
    // so nothing is written at all.
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'app/api/route.go'), PLAIN)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(await goMod(dir)).toBe('module example.com/app\n\ngo 1.24.0\n')
    expect(Log.info).not.toHaveBeenCalled()

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

  it('leaves nested modules that do not use the SDK alone', async () => {
    const dir = await temporaryDirectory()
    await writeModule(dir, 'example.com/app')
    await write(join(dir, 'proxy.go'), PROXY)
    const service = join(dir, 'services/worker')
    await writeModule(service, 'example.com/worker')
    await write(join(service, 'main.go'), PLAIN)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(await goMod(dir)).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(await goMod(service)).toBe(
      'module example.com/worker\n\ngo 1.24.0\n'
    )
  })

  it('does nothing for Go sources without a module that do not import next/go', async () => {
    const dir = await temporaryDirectory()
    await write(join(dir, 'app/api/route.go'), PLAIN)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(Log.info).not.toHaveBeenCalled()
    expect(Log.warn).not.toHaveBeenCalled()
  })

  it('warns once when next/go is imported outside a Go module', async () => {
    // Go cannot resolve next/go without a go.mod replacement and would only
    // report "package next/go is not in std".
    const dir = await temporaryDirectory()
    await write(join(dir, 'proxy.go'), PROXY)
    const sdkDir = await installNext(dir, '16.0.0')

    await ensureGoSdk({ dir, rootDir: dir, sdkDir })

    expect(Log.info).not.toHaveBeenCalled()
    expect(Log.warn).toHaveBeenCalledTimes(1)
    expect(Log.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'proxy.go imports next/go, but is not in a Go module'
      )
    )

    // The dev server runs this on every Go change; warn only once.
    await ensureGoSdk({ dir, rootDir: dir, sdkDir })
    expect(Log.warn).toHaveBeenCalledTimes(1)
  })
})
