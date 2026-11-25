import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checkNativeRouteStartup } from 'next/dist/build/check-native-routes'

const describeUnix = process.platform === 'win32' ? describe.skip : describe

describeUnix('checkNativeRouteStartup', () => {
  let dir: string
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'native-route-check-'))
    await fs.mkdir(join(dir, '.next/server/app/a'), { recursive: true })
    await fs.mkdir(join(dir, '.next/server/app/b'), { recursive: true })
  })
  afterEach(() => fs.rm(dir, { recursive: true, force: true }))

  async function executable(name: string, script: string) {
    const file = join(dir, '.next/server', name)
    await fs.writeFile(file, `#!/bin/sh\n${script}\n`, { mode: 0o755 })
  }
  async function descriptor(entry: string, name: string) {
    await fs.writeFile(
      join(dir, '.next/server', entry),
      JSON.stringify({ executable: name, route: '/' })
    )
  }

  it('initializes each shared executable once from the project directory', async () => {
    const log = join(dir, 'log')
    await executable(
      'go-routes-ok',
      `echo "$__NEXT_GO_STARTUP_CHECK $(pwd)" >> ${JSON.stringify(log)}`
    )
    await descriptor('app/a/route.native.json', 'go-routes-ok')
    await descriptor('app/b/route.native.json', 'go-routes-ok')
    await checkNativeRouteStartup(join(dir), join(dir, '.next'), [
      'app/a/route.native.json',
      'app/b/route.native.json',
    ])
    expect((await fs.readFile(log, 'utf8')).trim()).toBe(
      `1 ${await fs.realpath(dir)}`
    )
  })

  it('reports an initialization failure with its output', async () => {
    await executable(
      'go-routes-fail',
      'echo \'panic: pattern "/metrics" conflicts\' >&2; exit 2'
    )
    await descriptor('app/a/route.native.json', 'go-routes-fail')
    await expect(
      checkNativeRouteStartup(dir, join(dir, '.next'), [
        'app/a/route.native.json',
      ])
    ).rejects.toThrow(
      /The Go Route Handler executable failed while initializing \(exit code 2\)[\s\S]*goRoutesStartupCheck: false[\s\S]*panic: pattern "\/metrics" conflicts/
    )
  })

  it('never reads stdout, however much the executable writes', async () => {
    await executable('go-routes-noisy', 'head -c 4000000 /dev/zero')
    await descriptor('app/a/route.native.json', 'go-routes-noisy')
    await expect(
      checkNativeRouteStartup(dir, join(dir, '.next'), [
        'app/a/route.native.json',
      ])
    ).resolves.toBeUndefined()
  })

  it('reports too much initialization output apart from a timeout', async () => {
    await executable(
      'go-routes-chatty',
      "printf '0123456789abcdef' >&2; exec sleep 5"
    )
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
    await executable(
      'go-routes-background',
      'echo initialized >&2; sleep 4 & exit 0'
    )
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

    await executable(
      'go-routes-background-fail',
      'sleep 4 & echo boom >&2; exit 3'
    )
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
    // The shell's sleep keeps stderr open after the executable is stopped.
    await executable('go-routes-slow', 'echo connecting >&2; sleep 5')
    await descriptor('app/a/route.native.json', 'go-routes-slow')
    await expect(
      checkNativeRouteStartup(
        dir,
        join(dir, '.next'),
        ['app/a/route.native.json'],
        { timeoutMs: 200 }
      )
    ).rejects.toThrow(
      /did not finish initializing within 0\.2 seconds[\s\S]*connecting$/
    )
  })
})
