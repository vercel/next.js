import { run, useTempDir } from '../utils'
import { findPort, killApp, launchApp, retry, waitFor } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

describe('create-next-app templates should have no browser warnings', () => {
  let nextTgzFilename: string

  beforeAll(() => {
    if (!process.env.NEXT_TEST_PKG_PATHS) {
      throw new Error('This test needs to be run with `node run-tests.js`.')
    }

    const pkgPaths = new Map<string, string>(
      JSON.parse(process.env.NEXT_TEST_PKG_PATHS)
    )

    nextTgzFilename = pkgPaths.get('next')!
  })

  it('should have no browser warnings or errors with --tailwind', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-tw-no-warnings'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--no-src-dir',
          '--tailwind',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        { cwd }
      )
      expect(exitCode).toBe(0)

      const dir = join(cwd, projectName)
      const port = await findPort()
      const app = await launchApp(dir, port, {
        nextBin: join(dir, 'node_modules/next/dist/bin/next'),
      })

      try {
        const browser = await webdriver(port, '/')

        await waitFor(2000)

        await retry(async () => {
          const logs = await browser.log()

          const allMessages = logs.map((log: any) => log.message).join('\n')
          expect(
            allMessages.includes('hydrate callback') ||
              allMessages.includes('already hydrated')
          ).toBe(true)

          const warnings = logs.filter((log: any) => log.source === 'warning')
          const errors = logs.filter((log: any) => log.source === 'error')

          expect(warnings).toEqual([])
          expect(errors).toEqual([])
        })

        await browser.close()
      } finally {
        await killApp(app)
      }
    })
  })
})
