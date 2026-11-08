import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import os from 'os'
import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'

// Cache handlers outside of Next.js import `SharedCacheControls` from
// `shared-cache-controls.external` to record the lifetime of an entry. Next.js
// itself does not import that path anymore, so only the file trace of the
// server keeps it in standalone output.
describe('standalone mode - shared-cache-controls-old-path', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let movedOutput: string

  beforeAll(async () => {
    await next.build()
    movedOutput = await fs.mkdtemp(join(os.tmpdir(), 'next-standalone-'))
  })

  afterAll(async () => {
    await fs.remove(movedOutput)
  })

  async function expectRecordedLifetime(output: string) {
    // Added after the build, so file tracing has not seen what it imports.
    await fs.copy(
      join(next.testDir, 'late-cache-handler.js'),
      join(output, 'cache-handler.js')
    )

    // `NODE_PATH` of the test runner could lead to another copy of Next.js.
    const { NODE_PATH, ...env } = { ...process.env, ...next.env }
    const port = await findPort()
    const server = await initNextServerScript(
      join(output, 'server.js'),
      /- Local:/,
      { ...env, PORT: port.toString() },
      undefined,
      { cwd: output }
    )
    try {
      const res = await fetchViaHTTP(port, '/')
      expect(await res.text()).toContain('hello world')
      expect(res.headers.get('cache-control')).toBe(
        's-maxage=123, stale-while-revalidate=333'
      )
    } finally {
      await killApp(server)
    }
  }

  // Without the file, Node.js would resolve the import from the
  // `node_modules` of the project: a second class with its own map, which the
  // server never reads.
  it('should use a lifetime that is recorded through the old path when the output runs in place', async () => {
    await expectRecordedLifetime(join(next.testDir, '.next/standalone'))
  })

  // Without the file, the import would fail.
  it('should use a lifetime that is recorded through the old path when the output was moved', async () => {
    const output = join(movedOutput, 'standalone')
    await fs.move(join(next.testDir, '.next/standalone'), output)
    await expectRecordedLifetime(output)
  })
})
