import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

// TODO(NAR-423): Migrate to Cache Components.
describe.skip('source-mapping', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work with server actions passed to client components', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementByCss('#form-1 p').text()).toBe('initial')
    await browser.elementByCss('#form-1 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-1 p').text()).toBe(
        'default exported arrow function expression'
      )
    })

    expect(await browser.elementByCss('#form-2 p').text()).toBe('initial')
    await browser.elementByCss('#form-2 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-2 p').text()).toBe(
        'default exported anonymous function expression'
      )
    })

    expect(await browser.elementByCss('#form-3 p').text()).toBe('initial')
    await browser.elementByCss('#form-3 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-3 p').text()).toBe(
        'default exported named function expression'
      )
    })

    expect(await browser.elementByCss('#form-4 p').text()).toBe('initial')
    await browser.elementByCss('#form-4 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-4 p').text()).toBe(
        'exported exported arrow function expression'
      )
    })

    expect(await browser.elementByCss('#form-5 p').text()).toBe('initial')
    await browser.elementByCss('#form-5 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-5 p').text()).toBe(
        'exported named function declaration'
      )
    })

    expect(await browser.elementByCss('#form-6 p').text()).toBe('initial')
    await browser.elementByCss('#form-6 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-6 p').text()).toBe(
        'exported anonymous function expression'
      )
    })

    expect(await browser.elementByCss('#form-7 p').text()).toBe('initial')
    await browser.elementByCss('#form-7 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-7 p').text()).toBe(
        'exported named function expression'
      )
    })

    expect(await browser.elementByCss('#form-8 p').text()).toBe('initial')
    await browser.elementByCss('#form-8 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-8 p').text()).toBe(
        'declarator arrow function expression'
      )
    })

    expect(await browser.elementByCss('#form-9 p').text()).toBe('initial')
    await browser.elementByCss('#form-9 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-9 p').text()).toBe(
        'function declaration'
      )
    })

    expect(await browser.elementByCss('#form-10 p').text()).toBe('initial')
    await browser.elementByCss('#form-10 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-10 p').text()).toBe(
        'arrow function expression'
      )
    })

    expect(await browser.elementByCss('#form-11 p').text()).toBe('initial')
    await browser.elementByCss('#form-11 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-11 p').text()).toBe(
        'anonymous function expression'
      )
    })

    expect(await browser.elementByCss('#form-12 p').text()).toBe('initial')
    await browser.elementByCss('#form-12 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-12 p').text()).toBe(
        'named function expression'
      )
    })
  })

  it('should work with server actions imported from client components', async () => {
    const browser = await next.browser('/client')

    expect(await browser.elementByCss('#form-1 p').text()).toBe('initial')
    await browser.elementByCss('#form-1 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-1 p').text()).toBe(
        'default exported arrow function expression'
      )
    })

    expect(await browser.elementByCss('#form-2 p').text()).toBe('initial')
    await browser.elementByCss('#form-2 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-2 p').text()).toBe(
        'default exported anonymous function expression'
      )
    })

    expect(await browser.elementByCss('#form-3 p').text()).toBe('initial')
    await browser.elementByCss('#form-3 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-3 p').text()).toBe(
        'default exported named function expression'
      )
    })

    expect(await browser.elementByCss('#form-4 p').text()).toBe('initial')
    await browser.elementByCss('#form-4 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-4 p').text()).toBe(
        'exported exported arrow function expression'
      )
    })

    expect(await browser.elementByCss('#form-5 p').text()).toBe('initial')
    await browser.elementByCss('#form-5 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-5 p').text()).toBe(
        'exported named function declaration'
      )
    })

    expect(await browser.elementByCss('#form-6 p').text()).toBe('initial')
    await browser.elementByCss('#form-6 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-6 p').text()).toBe(
        'exported anonymous function expression'
      )
    })

    expect(await browser.elementByCss('#form-7 p').text()).toBe('initial')
    await browser.elementByCss('#form-7 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-7 p').text()).toBe(
        'exported named function expression'
      )
    })
  })

  it('should show an error when client functions are called from server components', async () => {
    const browser = await next.browser('/server-client')

    await expect(browser).toDisplayRedbox(`
     {
       "description": "Attempted to call useClient() from the server but useClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.",
       "environmentLabel": "${isCacheComponentsEnabled ? 'Prerender' : 'Server'}",
       "label": "Runtime Error",
       "source": "app/server-client/page.js (5:12) @ Component
     > 5 |   useClient()
         |            ^",
       "stack": [
         "Component app/server-client/page.js (5:12)",
       ],
     }
    `)
  })
})
