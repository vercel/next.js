import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxCallStack,
  getRedboxDescription,
  waitForAndOpenRuntimeError,
} from 'next-test-utils'

describe('app-dir - capture-console-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should error on capture console error', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('button').click()

    await waitForAndOpenRuntimeError(browser)
    await assertHasRedbox(browser)

    const description = await getRedboxDescription(browser)
    const callStacks = await getRedboxCallStack(browser)
    const result = {
      description,
      callStacks,
    }

    if (process.env.TURBOPACK) {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "description": "Error: trigger an console <error>",
        }
      `)
    } else {
      expect(result).toMatchInlineSnapshot(`
        {
          "callStacks": "",
          "description": "Error: trigger an console <error>",
        }
      `)
    }
  })
})
