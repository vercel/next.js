import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'

describe('hello-world', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should prevent javascript URLs in link `href`', async () => {
    const browser = await next.browser('/app/link-href', {
      pushErrorAsConsoleLog: true,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('a').click()

    // Wait a bit to ensure no navigation occurs
    await new Promise((r) => setTimeout(r, 1000))

    const finalUrl = await browser.url()
    expect(finalUrl).toBe(initialUrl) // URL should not have changed

    // Check that the browser logged the React security error
    const logs = await browser.log()
    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          'React has blocked a javascript: URL as a security precaution'
        )
    )
    expect(errors.length).toBeGreaterThan(0)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in link `as`', async () => {
    const browser = await next.browser('/app/link-as', {
      pushErrorAsConsoleLog: true,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('a').click()

    // Wait a bit to ensure no navigation occurs
    await new Promise((r) => setTimeout(r, 1000))

    const finalUrl = await browser.url()
    expect(finalUrl).toBe(initialUrl) // URL should not have changed

    // Check that the browser logged the React security error
    const logs = await browser.log()
    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          'React has blocked a javascript: URL as a security precaution'
        )
    )
    expect(errors.length).toBeGreaterThan(0)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in route.push', async () => {
    const browser = await next.browser('/app/router-push', {
      pushErrorAsConsoleLog: true,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    // Wait a bit to ensure no navigation occurs
    await new Promise((r) => setTimeout(r, 1000))

    const finalUrl = await browser.url()
    expect(finalUrl).toBe(initialUrl) // URL should not have changed

    // Check that the browser logged the React security error
    const logs = await browser.log()
    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          'Next.js has blocked a javascript: URL as a security precaution'
        )
    )
    expect(errors.length).toBeGreaterThan(0)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in route.replace', async () => {
    jest.useRealTimers()
    const browser = await next.browser('/app/router-replace', {
      pushErrorAsConsoleLog: true,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    // Wait a bit to ensure no navigation occurs
    await new Promise((r) => setTimeout(r, 1000))

    const finalUrl = await browser.url()
    expect(finalUrl).toBe(initialUrl) // URL should not have changed

    // Check that the browser logged the React security error
    const logs = await browser.log()
    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          'Next.js has blocked a javascript: URL as a security precaution'
        )
    )
    expect(errors.length).toBeGreaterThan(0)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in route.prefetch', async () => {
    const browser = await next.browser('/app/router-prefetch', {
      pushErrorAsConsoleLog: true,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    // Wait a bit to ensure no navigation occurs
    await new Promise((r) => setTimeout(r, 1000))

    const finalUrl = await browser.url()
    expect(finalUrl).toBe(initialUrl) // URL should not have changed

    // Check that the browser logged the React security error
    const logs = await browser.log()
    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          'Next.js has blocked a javascript: URL as a security precaution'
        )
    )
    expect(errors.length).toBeGreaterThan(0)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in server action redirect through onClick', async () => {
    const browser = await next.browser('/app/action-redirect-onclick', {
      pushErrorAsConsoleLog: true,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    // Wait a bit to ensure no navigation occurs
    await new Promise((r) => setTimeout(r, 1000))

    const finalUrl = await browser.url()
    expect(finalUrl).toBe(initialUrl) // URL should not have changed

    // Check that the browser logged the React security error
    const logs = await browser.log()
    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          'Next.js has blocked a javascript: URL as a security precaution'
        )
    )
    expect(errors.length).toBeGreaterThan(0)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in server action redirect through form action', async () => {
    const browser = await next.browser('/app/action-redirect-form', {
      pushErrorAsConsoleLog: true,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    // Wait a bit to ensure no navigation occurs
    await new Promise((r) => setTimeout(r, 1000))

    const finalUrl = await browser.url()
    expect(finalUrl).toBe(initialUrl) // URL should not have changed

    // Check that the browser logged the React security error
    const logs = await browser.log()
    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          'Next.js has blocked a javascript: URL as a security precaution'
        )
    )
    expect(errors.length).toBeGreaterThan(0)

    // Click the safe page link
    await browser.elementByCss('a[href="/app/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/app/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/app/safe')
  })

  it('should prevent javascript URLs in pages router Link component', async () => {
    const browser = await next.browser('/pages/link-href', {
      pushErrorAsConsoleLog: true,
    })
    const initialUrl = await browser.url()

    await Promise.race([
      browser.elementByCss('a').click(),
      new Promise((r) => setTimeout(r, 4000)),
    ])

    const finalUrl = await browser.url()
    expect(finalUrl).toBe(initialUrl) // URL should not have changed

    // Check that the browser logged the React security error
    const logs = await browser.log()
    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          'React has blocked a javascript: URL as a security precaution'
        )
    )
    expect(errors.length).toBeGreaterThan(0)

    // Click the safe page link
    await browser.elementByCss('a[href="/pages/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/pages/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/pages/safe')
  })

  it('should prevent javascript URLs in pages router Link as prop', async () => {
    const browser = await next.browser('/pages/link-as', {
      pushErrorAsConsoleLog: true,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('a').click()

    // Wait a bit to ensure no navigation occurs
    await new Promise((r) => setTimeout(r, 1000))

    const finalUrl = await browser.url()
    expect(finalUrl).toBe(initialUrl) // URL should not have changed

    // Check that the browser logged the React security error
    const logs = await browser.log()
    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          'Next.js has blocked a javascript: URL as a security precaution'
        )
    )
    expect(errors.length).toBeGreaterThan(0)

    // Click the safe page link
    await browser.elementByCss('a[href="/pages/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/pages/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/pages/safe')
  })

  it('should prevent javascript URLs in pages router router.push', async () => {
    const browser = await next.browser('/pages/router-push', {
      pushErrorAsConsoleLog: true,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    // Wait a bit to ensure no navigation occurs
    await new Promise((r) => setTimeout(r, 1000))

    const finalUrl = await browser.url()
    expect(finalUrl).toBe(initialUrl) // URL should not have changed

    // Check that the browser logged the React security error
    const logs = await browser.log()
    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          'Next.js has blocked a javascript: URL as a security precaution'
        )
    )
    expect(errors.length).toBeGreaterThan(0)

    // Click the safe page link
    await browser.elementByCss('a[href="/pages/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/pages/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/pages/safe')
  })

  it('should prevent javascript URLs in pages router router.replace', async () => {
    const browser = await next.browser('/pages/router-replace', {
      pushErrorAsConsoleLog: true,
    })
    const initialUrl = await browser.url()

    await browser.elementByCss('button').click()

    // Wait a bit to ensure no navigation occurs
    await new Promise((r) => setTimeout(r, 1000))

    const finalUrl = await browser.url()
    expect(finalUrl).toBe(initialUrl) // URL should not have changed

    // Check that the browser logged the React security error
    const logs = await browser.log()
    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          'Next.js has blocked a javascript: URL as a security precaution'
        )
    )
    expect(errors.length).toBeGreaterThan(0)

    await waitForNoRedbox(browser)

    // Click the safe page link
    await browser.elementByCss('a[href="/pages/safe"]').click()

    // Wait for navigation to complete
    await browser.waitForCondition(
      'window.location.pathname.includes("/pages/safe")'
    )

    const safePageUrl = await browser.url()
    expect(safePageUrl).toContain('/pages/safe')
  })
})
