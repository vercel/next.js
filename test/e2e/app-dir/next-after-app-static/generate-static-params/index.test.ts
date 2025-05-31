/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import * as Log from './utils/log'
import { assertNoRedbox, retry } from '../../../../lib/next-test-utils'

describe('after() in generateStaticParams', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true, // reading CLI logs to observe after
    skipStart: true,
  })

  if (skipped) return

  let currentCliOutputIndex = 0
  beforeEach(() => {
    currentCliOutputIndex = next.cliOutput.length
  })

  const getLogs = () => {
    if (next.cliOutput.length < currentCliOutputIndex) {
      // cliOutput shrank since we started the test, so something (like a `sandbox`) reset the logs
      currentCliOutputIndex = 0
    }
    return next.cliOutput.slice(currentCliOutputIndex)
  }

  if (isNextDev) {
    it('runs after callbacks when visiting a page in dev', async () => {
      await next.start()
      const browser = await next.browser('/one/a')

      expect(await browser.elementByCss('body').text()).toBe('Param: a')
      await assertNoRedbox(browser)
      await retry(async () => {
        expect(Log.readCliLogs(getLogs())).toContainEqual({
          source: '[generateStaticParams] /one/[myParam]',
        })
      })

      await browser.get(new URL('/two/d', next.url).href)
      expect(await browser.elementByCss('body').text()).toBe('Param: d')
      await assertNoRedbox(browser)
      await retry(async () => {
        expect(Log.readCliLogs(getLogs())).toContainEqual({
          source: '[generateStaticParams] /two/[myParam]',
        })
      })
    })
  } else {
    it('runs after callbacks for each page during build', async () => {
      const buildResult = await next.build()
      expect(buildResult?.exitCode).toBe(0)

      {
        // after should run at build time
        const logsFromAfter = Log.readCliLogs(getLogs())
        expect(logsFromAfter).toContainEqual({
          source: '[generateStaticParams] /one/[myParam]',
        })
        expect(logsFromAfter).toContainEqual({
          source: '[generateStaticParams] /two/[myParam]',
        })
      }
    })
  }
})
