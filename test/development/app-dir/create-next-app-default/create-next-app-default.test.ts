import { createNext } from 'e2e-utils'
import { retry } from 'next-test-utils'
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

        const nextBin = 'node_modules/next/dist/bin/next'
        const next = await createNext({
          files: join(cwd, projectName),
          installCommand: 'true',
          skipStart: false,
          startCommand: `node ${nextBin} dev`,
          startServerTimeout: 60_000,
        })
        let browser: Awaited<ReturnType<typeof next.browser>> | undefined

        try {
          browser = await next.browser('/')
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

          const messages = (await page.log()).filter(
            (log) => log.source === 'warning' || log.source === 'error'
          )
          expect(messages).toEqual([])
        } finally {
          await browser?.close()
          await next.destroy()
        }
      })
    },
    TEST_TIMEOUT_MS
  )
})
