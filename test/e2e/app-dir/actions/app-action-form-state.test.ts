import { FileRef, nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'path'

describe('app-dir action useActionState', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: process.env.TEST_NODE_MIDDLEWARE
      ? {
          'middleware.js': new FileRef(join(__dirname, 'middleware-node.js')),
        }
      : {},
    dependencies: {
      nanoid: '4.0.1',
    },
  })
  it('should support submitting form state with JS', async () => {
    const browser = await next.browser('/client/form-state')

    await browser.eval(`document.getElementById('name-input').value = 'test'`)
    await browser.elementByCss('#submit-form').click()

    await check(() => {
      return browser.elementByCss('#form-state').text()
    }, 'initial-state:test')
  })

  it('should support submitting form state without JS', async () => {
    const browser = await next.browser('/client/form-state', {
      disableJavaScript: true,
    })

    await browser.eval(`document.getElementById('name-input').value = 'test'`)
    await browser.elementByCss('#submit-form').click()

    // It should inline the form state into HTML so it can still be hydrated.
    await check(() => {
      return browser.elementByCss('#form-state').text()
    }, 'initial-state:test')
  })

  it('should support hydrating the app from progressively enhanced form request', async () => {
    const browser = await next.browser('/client/form-state')

    // Simulate a progressively enhanced form request
    await browser.eval(`document.getElementById('name-input').value = 'test'`)
    await browser.eval(`document.getElementById('form-state-form').submit()`)

    await check(() => {
      return browser.elementByCss('#form-state').text()
    }, 'initial-state:test')

    // Should hydrate successfully
    await check(() => {
      return browser.elementByCss('#hydrated').text()
    }, 'hydrated')
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

    await check(() => {
      return browser.elementByCss('#form-state').text()
    }, 'initial-state:test-permalink')
  })
})
