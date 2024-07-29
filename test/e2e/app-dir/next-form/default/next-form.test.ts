import { nextTestSetup } from 'e2e-utils'
import { BrowserInterface } from '../../../../lib/next-webdriver'

describe('app dir - form', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (skipped) {
    return
  }

  it('should soft-navigate on submit and show the prefetched loading state', async () => {
    const session = await next.browser('/forms/basic')
    const navigationTracker = await trackMpaNavs(session)

    const searchInput = await session.elementByCss('input[name="query"]')
    await searchInput.fill('my search')

    const submitButton = await session.elementByCss('[type="submit"]')
    await submitButton.click()

    // we should have prefetched a loading state, so it should be displayed
    await session.waitForElementByCss('#loading')

    const result = await session.waitForElementByCss('#search-results').text()
    expect(result).toMatch(/query: "my search"/)

    expect(await navigationTracker.didMpaNavigate()).toBe(false)
  })

  it('should soft-navigate to the formAction url of the submitter', async () => {
    const session = await next.browser('/forms/button-formaction')
    const navigationTracker = await trackMpaNavs(session)

    const searchInput = await session.elementByCss('input[name="query"]')
    await searchInput.fill('my search')

    const submitButton = await session.elementByCss('[type="submit"]')
    await submitButton.click()

    // we didn't prefetch a loading state, so we don't know if it'll be displayed
    // TODO: is this correct? it'll probably be there in dev, but what about prod?
    // await session.waitForElementByCss('#loading')

    const result = await session.waitForElementByCss('#search-results').text()
    expect(result).toMatch(/query: "my search"/)

    expect(await navigationTracker.didMpaNavigate()).toBe(false)
  })

  describe('functions passed to action', () => {
    it.each([
      {
        name: 'client action',
        path: '/forms/with-function/action-client',
      },
      {
        name: 'server action',
        path: '/forms/with-function/action-server',
      },
      {
        name: 'server action (closure)',
        path: '/forms/with-function/action-server-closure',
      },
    ])('runs $name', async ({ path }) => {
      const session = await next.browser(path)
      const navigationTracker = await trackMpaNavs(session) // actions should not MPA-navigate either.

      const searchInput = await session.elementByCss('input[name="query"]')
      await searchInput.fill('will not be a search')

      const submitButton = await session.elementByCss('[type="submit"]')
      await submitButton.click()

      const result = await session
        .waitForElementByCss('#redirected-results')
        .text()
      expect(result).toMatch(/query: "will not be a search"/)

      expect(await navigationTracker.didMpaNavigate()).toBe(false)
    })
  })

  describe('functions passed to formAction', () => {
    it.each([
      {
        name: 'client action',
        path: '/forms/with-function/button-formaction-client',
      },
      {
        name: 'server action',
        path: '/forms/with-function/button-formaction-server',
      },
      {
        name: 'server action (closure)',
        path: '/forms/with-function/button-formaction-server-closure',
      },
    ])(
      "runs $name from submitter and doesn't warn about unsupported attributes",
      async ({ path }) => {
        const session = await next.browser(path)
        const navigationTracker = await trackMpaNavs(session) // actions should not MPA-navigate either.

        const searchInput = await session.elementByCss('input[name="query"]')
        await searchInput.fill('will not be a search')

        const submitButton = await session.elementByCss('[type="submit"]')
        await submitButton.click()

        const result = await session
          .waitForElementByCss('#redirected-results')
          .text()
        expect(result).toMatch(/query: "will not be a search"/)

        expect(await navigationTracker.didMpaNavigate()).toBe(false)

        if (isNextDev) {
          const logs = (await session.log()).map((item) => item.message)

          expect(logs).not.toContainEqual(
            expect.stringMatching(
              /<Form>'s `.+?` was set to an unsupported value/
            )
          )
        }
      }
    )
  })

  describe('unsupported attributes on submitter', () => {
    it.each([
      { name: 'formEncType', baseName: 'encType' },
      { name: 'formMethod', baseName: 'method' },
      { name: 'formTarget', baseName: 'target' },
    ])(
      'should warn if submitter sets "$name" to an unsupported value and fall back to default submit behavior',
      async ({ name: attributeName, baseName: attributeBaseName }) => {
        const session = await next.browser(
          `/forms/button-formaction-unsupported?attribute=${attributeName}`
        )

        const submitButton = await session.elementByCss('[type="submit"]')
        await submitButton.click()

        const logs = await session.log()

        if (isNextDev) {
          expect(logs).toContainEqual(
            expect.objectContaining({
              source: 'error',
              message: expect.stringContaining(
                `<Form>'s \`${attributeBaseName}\` was set to an unsupported value`
              ),
            })
          )
        }

        expect(logs).toContainEqual(
          expect.objectContaining({
            source: 'log',
            message: expect.stringContaining(
              'correct: default submit behavior was not prevented'
            ),
          })
        )
        expect(logs).not.toContainEqual(
          expect.objectContaining({
            source: 'log',
            message: expect.stringContaining(
              'incorrect: default submit behavior was prevented'
            ),
          })
        )
      }
    )
  })

  it('does not push a new history entry if `replace` is passed', async () => {
    const session = await next.browser(`/forms/with-replace`)
    const navigationTracker = await trackMpaNavs(session)

    // apparently this is usually not 1...?
    const prevHistoryLength: number = await session.eval(`history.length`)

    const submitButton = await session.elementByCss('[type="submit"]')
    await submitButton.click()

    await session.waitForElementByCss('#search-results')

    expect(await navigationTracker.didMpaNavigate()).toBe(false)
    expect(await session.eval(`history.length`)).toEqual(prevHistoryLength)
  })

  it('does not navigate if preventDefault is called in onSubmit', async () => {
    const session = await next.browser(`/forms/with-onsubmit-preventdefault`)

    const submitButton = await session.elementByCss('[type="submit"]')
    await submitButton.click()

    // see fixture code for explanation why we expect this

    await session.waitForElementByCss('#redirected-results')
    expect(new URL(await session.url()).pathname).toEqual(
      '/redirected-from-action'
    )
  })

  // TODO(lubieowoce): implement this
  // (we don't have any methods on BrowserInterface to deal with files)
  it.todo('handles file inputs, but warns about them')
})

async function trackMpaNavs(session: BrowserInterface) {
  const id = Date.now()
  await session.eval(`window.__MPA_NAV_ID = ${id}`)
  return {
    async didMpaNavigate() {
      const maybeId = await session.eval(`window.__MPA_NAV_ID`)
      return id !== maybeId
    },
  }
}
