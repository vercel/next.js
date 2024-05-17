/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir action useActionState', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      react: '19.0.0-beta-04b058868c-20240508',
      'react-dom': '19.0.0-beta-04b058868c-20240508',
    },
  })
  it('should support submitting form state with JS', async () => {
    const browser = await next.browser('/client/form-state')

    await browser.eval(`document.getElementById('name-input').value = 'test'`)
    await browser.elementByCss('#submit-form').click()

    await retry(async () => {
      expect(await browser.elementByCss('#form-state').text()).toEqual(
        'initial-state:test'
      )
    })
  })

  it('should support submitting form state without JS', async () => {
    const browser = await next.browser('/client/form-state', {
      disableJavaScript: true,
    })

    await browser.eval(`document.getElementById('name-input').value = 'test'`)
    await browser.elementByCss('#submit-form').click()

    // It should inline the form state into HTML so it can still be hydrated.
    await retry(async () => {
      expect(await browser.elementByCss('#form-state').text()).toEqual(
        'initial-state:test'
      )
    })
  })

  it('should support hydrating the app from progressively enhanced form request', async () => {
    const browser = await next.browser('/client/form-state')

    // Simulate a progressively enhanced form request
    await browser.eval(`document.getElementById('name-input').value = 'test'`)
    await browser.eval(`document.getElementById('form-state-form').submit()`)

    await retry(async () => {
      expect(await browser.elementByCss('#form-state').text()).toEqual(
        'initial-state:test'
      )
    })

    // Should hydrate successfully
    await retry(async () => {
      expect(await browser.elementByCss('#hydrated').text()).toEqual('hydrated')
    })
  })

  it('should send the action to the provided permalink with form state when JS disabled', async () => {
    const browser = await next.browser('/client/form-state/page-2', {
      disableJavaScript: true,
    })

    // Simulate a progressively enhanced form request
    await browser.eval(
      `document.getElementById('name-input').value = 'test-permalink'`
    )
    await browser.eval(`document.getElementById('form-state-form').submit()`)

    await retry(async () => {
      expect(await browser.elementByCss('#form-state').text()).toEqual(
        'initial-state:test-permalink'
      )
    })
  })
})
