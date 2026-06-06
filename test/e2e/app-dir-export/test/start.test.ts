import { join } from 'path'
import { isNextStart, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const TEST_TIMEOUT = 5 * 60 * 1000
const TIMING_PREFIX = '[app-dir-export timing]'

function logTiming(message: string) {
  console.log(`${TIMING_PREFIX} ${new Date().toISOString()} ${message}`)
}

async function time<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
  const start = Date.now()
  logTiming(`${label}: started`)

  try {
    return await fn()
  } finally {
    logTiming(`${label}: settled after ${Date.now() - start}ms`)
  }
}

describe('app dir - with output export (next start)', () => {
  if (isNextStart) {
    const suiteStart = Date.now()
    logTiming('suite setup: started')

    const { next } = nextTestSetup({
      files: join(__dirname, '..'),
      skipStart: true,
    })

    beforeAll(() => {
      logTiming(`suite setup: completed after ${Date.now() - suiteStart}ms`)
    })

    afterAll(() => {
      logTiming(`suite: completed after ${Date.now() - suiteStart}ms`)
    })

    it.only(
      'should error during next start with output export',
      async () => {
        await time('output export test', async () => {
          const { exitCode } = await time('output export build', () =>
            next.build()
          )
          expect(exitCode).toBe(0)

          try {
            await time('output export next start', () =>
              next.start({ skipBuild: true })
            )
          } catch (e) {}

          await time('output export error assertion', () =>
            retry(() => {
              expect(next.cliOutput).toContain(
                `"next start" does not work with "output: export" configuration. Use "npx serve@latest out" instead.`
              )
            })
          )
        })

        expect('timing diagnostic completed').toBe(
          'intentional failure for CI timing comparison'
        )
      },
      TEST_TIMEOUT
    )

    it(
      'should warn during next start with output standalone',
      async () => {
        await time('output standalone test', () =>
          next.patchFile(
            'next.config.js',
            (content) =>
              content.replace(`output: 'export'`, `output: 'standalone'`),
            async () => {
              const { exitCode } = await time('output standalone build', () =>
                next.build()
              )
              expect(exitCode).toBe(0)

              try {
                await time('output standalone next start', () =>
                  next.start({ skipBuild: true })
                )
              } catch (e) {}

              await time('output standalone warning assertion', () =>
                retry(() => {
                  expect(next.cliOutput).toContain(
                    `"next start" does not work with "output: standalone" configuration. Use "node .next/standalone/server.js" instead.`
                  )
                })
              )
            }
          )
        )
      },
      TEST_TIMEOUT
    )
  } else {
    it('skipped in dev', () => {})
  }
})
