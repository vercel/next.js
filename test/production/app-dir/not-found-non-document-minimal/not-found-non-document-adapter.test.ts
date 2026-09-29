import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

describe('not-found-non-document-adapter', () => {
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

  it('returns a plain text 404 for subresource requests', async () => {
    const res = await fetch(`http://localhost:${port}/missing-image.png`, {
      headers: {
        'x-matched-path': '/_not-found',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
      },
    })
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(res.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
    expect(await res.text()).toBe('Not Found')
  })

  it('renders the not-found page for document requests', async () => {
    const res = await fetch(`http://localhost:${port}/does-not-exist`, {
      headers: {
        'x-matched-path': '/_not-found',
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
      },
    })
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('custom not found page')
  })

  it('serves the not-found RSC payload for router requests', async () => {
    const res = await fetch(`http://localhost:${port}/does-not-exist`, {
      headers: {
        'x-matched-path': '/_not-found',
        rsc: '1',
      },
    })
    expect(res.headers.get('content-type')).toContain('text/x-component')
    expect(await res.text()).not.toBe('Not Found')
  })

  it('renders the not-found page for requests without sec-fetch-dest', async () => {
    const res = await fetch(`http://localhost:${port}/whatever.bin`, {
      headers: {
        'x-matched-path': '/_not-found',
      },
    })
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('custom not found page')
  })
})
