import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxCallStack,
  getRedboxDescription,
  getRedboxTotalErrorCount,
  waitForAndOpenRuntimeError,
} from 'next-test-utils'

async function getRedboxResult(browser: any) {
  const description = await getRedboxDescription(browser)
  const callStacks = await getRedboxCallStack(browser)
  const count = await getRedboxTotalErrorCount(browser)
  const result = {
    count,
    description,
    callStacks,
  }
  return result
}

describe('app-dir - capture-console-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should error on capture browser console error and format the error message', async () => {
    const browser = await next.browser('/browser')
    await browser.elementByCss('button').click()

    await waitForAndOpenRuntimeError(browser)
    await assertHasRedbox(browser)

    const result = await getRedboxResult(browser)

    if (process.env.TURBOPACK) {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "count": 1,
          "description": "Error: trigger an console <error>",
        }
      `)
    } else {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "count": 1,
          "description": "Error: trigger an console <error>",
        }
      `)
    }
  })

  it('should error on capture server replay console error', async () => {
    const browser = await next.browser('/ssr')

    await waitForAndOpenRuntimeError(browser)
    await assertHasRedbox(browser)

    const result = await getRedboxResult(browser)

    if (process.env.TURBOPACK) {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "count": 2,
          "description": "Error: ssr console error:client",
        }
      `)
    } else {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "count": 2,
          "description": "Error: ssr console error:client",
        }
      `)
    }
  })
})
