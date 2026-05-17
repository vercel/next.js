import { spawn } from 'child_process'
import { findPort, killApp, retry } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  resolveNextTgzFilename,
  run,
  useTempDir,
} from '../../../production/create-next-app/utils'

const TEST_TIMEOUT_MS = 5 * 60 * 1000

describe('create-next-app default template', () => {
  let nextTgzFilename: string

  beforeAll(() => {
    nextTgzFilename = resolveNextTgzFilename()
  })

  it(
    'should create and run without browser warnings or errors',
    async () => {
      await useTempDir(async (cwd) => {
        const projectName = 'default-app'
        const { exitCode } = await run(
          [
            projectName,
            '--yes',
            ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
          ],
          nextTgzFilename,
          {
            cwd,
          }
        )

        expect(exitCode).toBe(0)

        const dir = join(cwd, projectName)
        const nextBin = join(dir, 'node_modules/next/dist/bin/next')
        const port = await findPort()
        const server = spawn(
          'node',
          [nextBin, 'dev', '-p', String(port), '-H', '127.0.0.1'],
          {
            cwd: dir,
            env: { ...process.env, HOSTNAME: '127.0.0.1' },
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        )

        // Freshly installed CNA projects (with tailwind, eslint plugins, etc.)
        // can take well over the default 10s to boot `next dev`. Give them
        // generous headroom so this test isn't flaky on loaded CI machines.
        const startServerTimeout = 60_000

        let browser: Awaited<ReturnType<typeof webdriver>> | undefined

        try {
          await new Promise<void>((resolve, reject) => {
            const onTimeout = setTimeout(() => {
              reject(
                new Error(
                  `next dev did not become ready within ${startServerTimeout}ms`
                )
              )
            }, startServerTimeout)

            const onReady = () => {
              clearTimeout(onTimeout)
              resolve()
            }

            const handleData = (chunk: Buffer) => {
              const msg = chunk.toString()
              process.stdout.write(msg)
              if (/- Local:|Ready in|✓ Ready/i.test(msg)) {
                onReady()
              }
            }

            server.stdout!.on('data', handleData)
            server.stderr!.on('data', (chunk: Buffer) => {
              process.stderr.write(chunk.toString())
            })
            server.on('exit', (code) => {
              clearTimeout(onTimeout)
              reject(
                new Error(
                  `next dev exited before becoming ready (code=${code})`
                )
              )
            })
          })

          browser = await webdriver(port, '/')
          const page = browser
          expect(await page.elementByCss('body').text()).toContain('Deploy Now')

          await retry(async () => {
            const imagesReady = await page.eval(`
              Array.from(document.images).every(
                (img) => img.complete && img.naturalWidth > 0
              )
            `)
            expect(imagesReady).toBe(true)
          })

          // In dev, the browser may fire a "preloaded using link preload but
          // not used within a few seconds from the window's load event"
          // warning for next/font's woff2 files when the stylesheet that
          // references them hasn't been applied by the time the browser's
          // internal timer fires (relative to window.load). The font is in
          // fact used moments later, so this is a benign timing race that
          // doesn't reproduce reliably — filter it out.
          const messages = (await page.log()).filter(
            (log) =>
              (log.source === 'warning' || log.source === 'error') &&
              !/was preloaded using link preload but not used/.test(log.message)
          )
          expect(messages).toEqual([])
        } finally {
          await browser?.close()
          await killApp(server).catch(() => {})
        }
      })
    },
    TEST_TIMEOUT_MS
  )
})
