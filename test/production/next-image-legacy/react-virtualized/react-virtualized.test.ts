import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

describe('react-virtualized wrapping next/legacy/image', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    dependencies: {
      'react-virtualized': 'latest',
      'http-proxy': '1.18.1',
    },
  })
  if (skipped) return

  let proxyChild: ChildProcess
  let proxyPort: number

  async function getCancelCount() {
    const res = await fetch(`http://localhost:${proxyPort}/_test/cancel-count`)
    const data = (await res.json()) as { cancelCount: number }
    return data.cancelCount
  }

  beforeAll(async () => {
    await next.build()
    await next.start()

    proxyChild = spawn(
      process.execPath,
      [join(next.testDir, 'server.js'), next.url, '0', '3000'],
      { stdio: ['ignore', 'pipe', 'inherit'] }
    )

    proxyPort = await new Promise<number>((resolve, reject) => {
      let buf = ''
      const onData = (chunk: Buffer) => {
        buf += chunk.toString()
        const m = buf.match(/__PORT__:(\d+)/)
        if (m) {
          proxyChild.stdout!.off('data', onData)
          resolve(Number(m[1]))
        }
      }
      proxyChild.stdout!.on('data', onData)
      proxyChild.once('exit', (code) => {
        reject(new Error(`proxy server exited early with code ${code}`))
      })
    })
  })

  afterAll(async () => {
    proxyChild?.kill()
  })

  it('should not cancel requests for images', async () => {
    // TODO: this test doesnt work unless we can set `disableCache: true`
    let browser = await next.browser('/', {
      baseUrl: proxyPort,
      disableCache: true,
    })
    expect(await getCancelCount()).toBe(0)
    await browser.eval('window.scrollTo({ top: 100, behavior: "smooth" })')
    await waitFor(100)
    expect(await getCancelCount()).toBe(0)
    await browser.eval('window.scrollTo({ top: 200, behavior: "smooth" })')
    await waitFor(200)
    expect(await getCancelCount()).toBe(0)
    await browser.eval('window.scrollTo({ top: 300, behavior: "smooth" })')
    await waitFor(300)
    expect(await getCancelCount()).toBe(0)
  })
})
