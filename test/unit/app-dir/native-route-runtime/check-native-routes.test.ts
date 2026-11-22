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
      /The Go Route Handler executable failed while initializing[\s\S]*panic: pattern "\/metrics" conflicts/
    )
  })
})
