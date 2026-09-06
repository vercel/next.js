import { nextTestSetup } from 'e2e-utils'
import {
  parseValidationMessages,
  waitForValidationEnd,
  waitForValidationStart,
} from 'e2e-utils/instant-validation'
import type { ValidationEvent } from 'next/dist/server/app-render/dev-validation-events'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'
import type * as Playwright from 'playwright'

describe('instant-validation-scheduling', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_TEST_LOG_VALIDATION: '1',
      // Keep validation active while the next document request reaches the
      // scheduler; cancellation releases this delay immediately.
      NEXT_TEST_DEV_VALIDATION_DELAY_MS: '2000',
    },
  })

  async function waitForValidationTerminal(
    requestId: string,
    getOutput: () => string
  ): Promise<ValidationEvent> {
    return retry(async () => {
      const terminal = parseValidationMessages(getOutput()).find(
        (event) =>
          event.requestId === requestId &&
          (event.type === 'validation_end' ||
            event.type === 'validation_aborted')
      )
      expect(terminal).toBeDefined()
      return terminal!
    })
  }

  async function navigate(
    browser: Awaited<ReturnType<typeof next.browser>>,
    act: ReturnType<typeof createRouterAct>,
    href: string,
    destinationText: string
  ) {
    await act(async () => {
      await browser.elementByCss(`input[data-link-accordion="${href}"]`).click()
      await browser.elementByCss(`a[href="${href}"]`).click()
    })
    await retry(async () => {
      expect(await browser.elementById('route').text()).toBe(destinationText)
    })
  }

  it('aborts superseded validations from successive navigations in one document', async () => {
    let page!: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(browserPage: Playwright.Page) {
        page = browserPage
      },
    })
    const act = createRouterAct(page)
    const cliStart = next.cliOutput.length
    const getOutput = () => next.cliOutput.slice(cliStart)

    await navigate(browser, act, '/routes/a', 'route-a')
    const validationA = await waitForValidationStart(
      await browser.url(),
      getOutput
    )
    await navigate(browser, act, '/routes/b', 'route-b')
    await expect(
      waitForValidationTerminal(validationA.requestId, getOutput)
    ).resolves.toMatchObject({ type: 'validation_aborted' })

    const validationB = await waitForValidationStart(
      await browser.url(),
      getOutput
    )
    await navigate(browser, act, '/routes/c', 'route-c')
    await expect(
      waitForValidationTerminal(validationB.requestId, getOutput)
    ).resolves.toMatchObject({ type: 'validation_aborted' })

    const validationC = await waitForValidationStart(
      await browser.url(),
      getOutput
    )
    await expect(
      waitForValidationEnd(validationC, getOutput)
    ).resolves.toMatchObject({ type: 'validation_end' })
  })

  it('does not supersede validation from another browser document', async () => {
    let pageB!: Playwright.Page
    const browserB = await next.browser('/', {
      beforePageLoad(browserPage: Playwright.Page) {
        pageB = browserPage
      },
    })
    const actB = createRouterAct(pageB)
    const cliStart = next.cliOutput.length
    const getOutput = () => next.cliOutput.slice(cliStart)

    const pageA = await pageB.context().newPage()
    await pageA.goto(`${next.url}/routes/a`)
    const validationA = await waitForValidationStart(pageA.url(), getOutput)

    await navigate(browserB, actB, '/routes/b', 'route-b')
    const validationB = await waitForValidationStart(
      await browserB.url(),
      getOutput
    )

    await expect(
      waitForValidationEnd(validationA, getOutput)
    ).resolves.toMatchObject({ type: 'validation_end' })
    await expect(
      waitForValidationEnd(validationB, getOutput)
    ).resolves.toMatchObject({ type: 'validation_end' })

    await pageA.close()
  })
})
