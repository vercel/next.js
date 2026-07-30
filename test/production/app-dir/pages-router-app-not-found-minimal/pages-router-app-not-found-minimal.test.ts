import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

describe('pages-router-app-not-found-minimal', () => {
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

  beforeAll(async () => {
    await next.build()

    port = await findPort()
    launcher = spawn('node', [path.join(next.testDir, 'adapter-launcher.js')], {
      cwd: next.testDir,
      env: { ...process.env, PORT: String(port) },
      stdio: 'pipe',
    })
    let output = ''
    launcher.stdout?.on('data', (chunk) => (output += chunk))
    launcher.stderr?.on('data', (chunk) => (output += chunk))
    await retry(async () => {
      expect(output).toContain('adapter launcher ready')
    })
  })

  afterAll(() => {
    launcher?.kill()
  })

  it('fully renders an app not-found selected by a pages route', async () => {
    const marker = `not-found-${Date.now()}`
    const res = await fetch(`http://localhost:${port}/pages-route/${marker}`, {
      headers: {
        cookie: `not-found-marker=${marker}`,
      },
    })
    const html = await res.text()

    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('x-nextjs-postponed')).toBeNull()
    expect(html).toContain('App Router not found')
    expect(html).toContain(marker)
  })
})
