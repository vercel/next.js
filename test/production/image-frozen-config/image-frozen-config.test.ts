import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

describe('image-frozen-config', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  let launcher: ChildProcess
  let port: number
  let output = ''

  beforeAll(async () => {
    await next.build()

    port = await findPort()
    launcher = spawn('node', [path.join(next.testDir, 'adapter-launcher.js')], {
      cwd: next.testDir,
      env: { ...process.env, PORT: String(port) },
      stdio: 'pipe',
    })
    launcher.stdout?.on('data', (chunk) => (output += chunk))
    launcher.stderr?.on('data', (chunk) => (output += chunk))
    await retry(async () => {
      expect(output).toContain('adapter launcher ready')
    })
  })

  afterAll(() => {
    launcher?.kill()
  })

  it('renders an external next/image consumer against the frozen config', async () => {
    const since = output.length
    const res = await fetch(`http://localhost:${port}/`, {
      headers: { 'x-matched-path': '/' },
    })
    const html = await res.text()

    expect(output.slice(since)).not.toContain(
      'Cannot assign to read only property'
    )
    expect(res.status).toBe(200)
    expect(html).toContain('id="external-image"')
  })
})
