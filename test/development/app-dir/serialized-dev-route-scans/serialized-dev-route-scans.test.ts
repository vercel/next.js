import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

const scanPauseFile = path.join(os.tmpdir(), `next-route-scan-${process.pid}`)

describe('serialized-dev-route-scans', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_TEST_DEV_ROUTE_SCAN_PAUSE_FILE: scanPauseFile,
      NEXT_TEST_DEV_ROUTE_SCAN_CAPTURE_PATH: 'app/second/route.ts',
    },
  })

  it('publishes overlapping scans in event order', async () => {
    await retry(async () => {
      const committedResponse = await next.fetch('/committed')
      expect(committedResponse.status).toBe(200)
      await committedResponse.arrayBuffer()
    }, 15_000)

    const firstFile = path.join(next.testDir, 'app/first/route.ts')
    const secondFile = path.join(next.testDir, 'app/second/route.ts')
    const claimedPauseFile = `${scanPauseFile}.claimed`
    await fs.mkdir(path.dirname(firstFile), { recursive: true })
    await fs.mkdir(path.dirname(secondFile), { recursive: true })
    await fs.writeFile(scanPauseFile, '')

    try {
      // Write directly: next.patchFile deliberately sleeps after app/pages
      // changes, which prevents the watcher events from overlapping.
      await fs.writeFile(
        firstFile,
        `export function GET() { return new Response('first') }`
      )

      // The first scan has captured /first when it pauses. The next Watchpack
      // event captures the newer generation containing both added routes.
      await retry(async () => {
        expect(next.cliOutput).toContain('[next-test] dev route scan 1 paused')
      }, 15_000)
      await fs.writeFile(
        secondFile,
        `export function GET() { return new Response('second') }`
      )
      await retry(async () => {
        expect(next.cliOutput).toContain(
          '[next-test] dev route scan 2 view captured'
        )
      }, 15_000)
      await fs.rm(claimedPauseFile)

      await retry(async () => {
        expect(next.cliOutput).toContain(
          '[next-test] dev route scan 1 published'
        )
        expect(next.cliOutput).toContain(
          '[next-test] dev route scan 2 published'
        )
      }, 15_000)

      // Turbopack observes the same files through its independent watcher, so
      // its entrypoints can become ready after the JS route scan is published.
      // Polling here keeps that separate readiness boundary out of this test.
      await retry(async () => {
        const [firstResponse, secondResponse] = await Promise.all([
          next.fetch('/first'),
          next.fetch('/second'),
        ])
        expect(firstResponse.status).toBe(200)
        expect(secondResponse.status).toBe(200)
        expect(await firstResponse.text()).toBe('first')
        expect(await secondResponse.text()).toBe('second')
      }, 15_000)
    } finally {
      await Promise.all([
        fs.rm(path.dirname(firstFile), { recursive: true, force: true }),
        fs.rm(path.dirname(secondFile), { recursive: true, force: true }),
        fs.rm(scanPauseFile, { force: true }),
        fs.rm(claimedPauseFile, { force: true }),
      ])
    }
  })
})
