import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import { retry } from 'next-test-utils'
import path from 'path'

const POLL_INTERVAL_MS = 500

describe('watch polling', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function writePage(content: string, mtimeMs: number) {
    const pagePath = path.join(next.testDir, 'pages/index.tsx')
    await fs.writeFile(
      pagePath,
      `export default function Page() { return <p>${content}</p> }`
    )
    const mtime = new Date(mtimeMs)
    await fs.utimes(pagePath, mtime, mtime)
  }

  it('detects subsecond changes while polling', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('initial')

    // PollWatcher used to truncate mtimes to whole seconds. Pin two updates to
    // the same future second so this test fails unless their subsecond parts
    // are preserved. The first update is observed before the second is made,
    // ensuring both watcher events are required.
    const sameSecond = Math.ceil(Date.now() / 1000) * 1000 + 10_000

    await writePage('first update', sameSecond + 100)
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('first update')
    }, POLL_INTERVAL_MS * 20)

    await writePage('second update', sameSecond + 200)
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('second update')
    }, POLL_INTERVAL_MS * 20)
  })
})
