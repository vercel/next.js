import { nextTestSetup } from 'e2e-utils'
import { retry, waitForRedbox, getRedboxDescription } from 'next-test-utils'

describe('app-dir refresh - valid usage', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should refresh client cache when refresh() is called in a server action', async () => {
    const browser = await next.browser('/refresh')

    const initialServerTimestamp = await browser
      .elementById('server-timestamp')
      .text()

    expect(initialServerTimestamp).toBeTruthy()

    await new Promise((resolve) => setTimeout(resolve, 100))

    await browser.elementById('refresh-button').click()

    await retry(async () => {
      const newServerTimestamp = await browser
        .elementById('server-timestamp')
        .text()
      expect(newServerTimestamp).not.toBe(initialServerTimestamp)
      expect(Number(newServerTimestamp)).toBeGreaterThan(
        Number(initialServerTimestamp)
      )
    })
  })

  it('should let you read your write after a redirect and refresh', async () => {
    const browser = await next.browser('/redirect-and-refresh')

    const todoEntries = await browser.elementById('todo-entries').text()
    expect(todoEntries).toBe('No entries')

    const todoInput = await browser.elementById('todo-input')
    await todoInput.fill('foo')

    await browser.elementById('add-button').click()

    await retry(async () => {
      const newTodoEntries = await browser.elementById('todo-entries').text()
      expect(newTodoEntries).toContain('foo')
    })

    expect(await browser.hasElementByCssSelector('#foo-page')).toBe(true)
    expect(await browser.url()).toContain('/redirect-and-refresh/foo')
  })
})

// Each invalid usage gets its own instance: the error messages are identical,
// and delayed runtime logs from one request must not satisfy another test.
describe.each([
  {
    usage: 'during page render',
    path: '/refresh-invalid-render',
    route: false,
  },
  { usage: 'in a route handler', path: '/refresh-invalid-route', route: true },
  { usage: 'in unstable_cache', path: '/refresh-invalid-cache', route: false },
])('app-dir refresh - $usage', ({ usage, path, route }) => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    captureRuntimeLogs: true,
  })

  it(`should throw an error when refresh() is called ${usage}`, async () => {
    const message = 'refresh can only be called from within a Server Action'
    if (route) {
      const res = await next.fetch(path)
      expect(res.status).toBe(500)
    } else {
      const browser = await next.browser(path)
      if (isNextDev) {
        await waitForRedbox(browser)
        expect(await getRedboxDescription(browser)).toContain(message)
        return
      }
    }

    await retry(() => {
      expect(next.cliOutput).toContain(message)
    }, 30_000)
  })
})
