import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('source-mapping', () => {
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
})
