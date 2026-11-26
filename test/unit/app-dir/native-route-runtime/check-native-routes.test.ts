import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { checkNativeRouteStartup } from 'next/dist/build/check-native-routes'

describe('checkNativeRouteStartup', () => {
  let dir: string
  let fixtureDir: string
  const suffix = process.platform === 'win32' ? '.exe' : ''
  beforeAll(async () => {
    fixtureDir = await fs.mkdtemp(join(tmpdir(), 'native-route-check-fixture-'))
    execFileSync(
      process.env.TURBOPACK_GO || 'go',
      [
        'build',
        '-o',
        join(fixtureDir, `startup${suffix}`),
        join(__dirname, 'fixtures/startup.go'),
      ],
      { env: { ...process.env, CGO_ENABLED: '0' }, stdio: 'inherit' }
    )
  })
  afterAll(() => fs.rm(fixtureDir, { recursive: true, force: true }))
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'native-route-check-'))
    await fs.mkdir(join(dir, '.next/server/app/a'), { recursive: true })
    await fs.mkdir(join(dir, '.next/server/app/b'), { recursive: true })
  })
  afterEach(async () => {
    const pids = await fs
      .readFile(join(dir, 'child-pids'), 'utf8')
      .catch(() => '')
    for (const pid of pids.split(/\s+/).filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGKILL')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
    // Windows cannot remove an executable until its process has exited.
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  })

  async function executable(name: string) {
    await fs.copyFile(
      join(fixtureDir, `startup${suffix}`),
      join(dir, '.next/server', name + suffix)
    )
  }
  async function descriptor(entry: string, name: string) {
    await fs.writeFile(
      join(dir, '.next/server', entry),
      JSON.stringify({ executable: name + suffix, route: '/' })
    )
  }

  it('initializes each shared executable once from the project directory', async () => {
    const log = join(dir, 'log')
    await executable('go-routes-ok')
    await descriptor('app/a/route.native.json', 'go-routes-ok')
    await descriptor('app/b/route.native.json', 'go-routes-ok')
    await checkNativeRouteStartup(join(dir), join(dir, '.next'), [
      'app/a/route.native.json',
      'app/b/route.native.json',
    ])
    const output = (await fs.readFile(log, 'utf8')).trim()
    expect(output.slice(0, 2)).toBe('1 ')
    expect(await fs.realpath(output.slice(2))).toBe(await fs.realpath(dir))
  })

  it('reports an initialization failure with its output', async () => {
    await executable('go-routes-fail')
    await descriptor('app/a/route.native.json', 'go-routes-fail')
    await expect(
      checkNativeRouteStartup(dir, join(dir, '.next'), [
        'app/a/route.native.json',
      ])
    ).rejects.toThrow(
      /The Go Route Handler executable failed while initializing \(exit code 2\)[\s\S]*goRoutesStartupCheck: false[\s\S]*panic: pattern "\/metrics" conflicts/
    )
  })

  it('reports an executable that cannot be started', async () => {
    await descriptor('app/a/route.native.json', 'missing')
    await expect(
      checkNativeRouteStartup(dir, join(dir, '.next'), [
        'app/a/route.native.json',
      ])
    ).rejects.toThrow(/could not be started[\s\S]*ENOENT/)
  })

  it('never reads stdout, however much the executable writes', async () => {
    await executable('go-routes-noisy')
    await descriptor('app/a/route.native.json', 'go-routes-noisy')
    await expect(
      checkNativeRouteStartup(dir, join(dir, '.next'), [
        'app/a/route.native.json',
      ])
    ).resolves.toBeUndefined()
  })

  it('reports too much initialization output apart from a timeout', async () => {
    await executable('go-routes-chatty')
    await descriptor('app/a/route.native.json', 'go-routes-chatty')
    const check = checkNativeRouteStartup(
      dir,
      join(dir, '.next'),
      ['app/a/route.native.json'],
      { maxStderrBytes: 10, timeoutMs: 4000 }
    )
    await expect(check).rejects.toThrow(
      /wrote more than 10 bytes to stderr while initializing[\s\S]*0123456789$/
    )
    await expect(check).rejects.not.toThrow(/did not finish initializing/)
  })

  it('decides when the executable exits, even if a child keeps stderr open', async () => {
    // A process started during initialization inherits stderr.
    await executable('go-routes-background')
    await descriptor('app/a/route.native.json', 'go-routes-background')
    const started = Date.now()
    await expect(
      checkNativeRouteStartup(
        dir,
        join(dir, '.next'),
        ['app/a/route.native.json'],
        { timeoutMs: 3000 }
      )
    ).resolves.toBeUndefined()
    expect(Date.now() - started).toBeLessThan(2000)

    await executable('go-routes-background-fail')
    await descriptor('app/a/route.native.json', 'go-routes-background-fail')
    await expect(
      checkNativeRouteStartup(
        dir,
        join(dir, '.next'),
        ['app/a/route.native.json'],
        { timeoutMs: 3000 }
      )
    ).rejects.toThrow(/failed while initializing \(exit code 3\)[\s\S]*boom$/)
    expect(Date.now() - started).toBeLessThan(4000)
  })

  it('reports a timeout with the output so far', async () => {
    // A child keeps stderr open after the executable is killed.
    await executable('go-routes-slow')
    await descriptor('app/a/route.native.json', 'go-routes-slow')
    await expect(
      checkNativeRouteStartup(
        dir,
        join(dir, '.next'),
        ['app/a/route.native.json'],
        { timeoutMs: 1000 }
      )
    ).rejects.toThrow(
      /did not finish initializing within 1 seconds[\s\S]*connecting$/
    )
  })
})
