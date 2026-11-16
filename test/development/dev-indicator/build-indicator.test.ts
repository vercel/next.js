import { nextTestSetup } from 'e2e-utils'
import { retry, toggleDevToolsIndicatorPopover } from 'next-test-utils'

const installCheckCompilingReplacesIssue = (browser) => {
  return browser.eval(`(function() {
    sessionStorage.setItem('showedCompilingInPlaceOfIssue', 'false')
    window.checkInterval = setInterval(function() {
      const root = document.querySelector('nextjs-portal').shadowRoot
      const statusElement = root.querySelector('[data-indicator-status]')
      const issuesElement = root.querySelector('[data-issues]')
      const logoButton = root.querySelector('[data-nextjs-dev-tools-button]')
      const badge = root.querySelector('[data-next-badge]')
      const statusDot = root.querySelector('[data-status-dot]')

      const isVisible =
        statusElement?.textContent.includes('Compiling') &&
        issuesElement === null &&
        logoButton !== null &&
        getComputedStyle(logoButton).display === 'none' &&
        badge?.getAttribute('data-error') === 'true' &&
        getComputedStyle(badge).backgroundColor === 'rgb(202, 42, 48)' &&
        getComputedStyle(statusDot).backgroundColor === 'rgb(255, 255, 255)'
      if (isVisible) {
        sessionStorage.setItem('showedCompilingInPlaceOfIssue', 'true')
        clearInterval(window.checkInterval)
      }
    }, 5)
  })()`)
}

const installCheckCompilingKeepsDisabledIssue = (browser) => {
  return browser.eval(`(function() {
    sessionStorage.setItem('keptDisabledIssueWhileCompiling', 'false')
    window.checkInterval = setInterval(function() {
      const root = document.querySelector('nextjs-portal').shadowRoot
      const statusElement = root.querySelector('[data-indicator-status]')
      const issuesElement = root.querySelector('[data-issues]')
      const badge = root.querySelector('[data-next-badge]')
      const status = badge?.getAttribute('data-status')

      const isVisible =
        status &&
        status !== 'none' &&
        statusElement === null &&
        issuesElement?.textContent.includes('Issue') &&
        root.querySelector('[data-disabled-icon]') !== null &&
        badge?.getAttribute('data-error') === 'true'
      if (isVisible) {
        sessionStorage.setItem('keptDisabledIssueWhileCompiling', 'true')
        clearInterval(window.checkInterval)
      }
    }, 5)
  })()`)
}

const waitForIssue = (browser) =>
  retry(async () => {
    expect(
      await browser.eval(`(function() {
        const root = document.querySelector('nextjs-portal').shadowRoot
        return root.querySelector('[data-issues]')?.textContent ?? null
      })()`)
    ).toContain('Issue')
  })

describe('build indicator with an issue', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      __NEXT_DEV_INDICATOR_COOLDOWN_MS: '0',
    },
  })

  it('shows red compiling status in place of an existing issue', async () => {
    const browser = await next.browser('/app/build-indicator/issue')

    await waitForIssue(browser)
    await installCheckCompilingReplacesIssue(browser)
    await browser.elementByCss('#to-enabled-slow').click()

    await retry(async () => {
      expect(
        await browser.eval(
          `sessionStorage.getItem('showedCompilingInPlaceOfIssue')`
        )
      ).toBe('true')
    })

    await retry(async () => {
      expect(await browser.elementByCss('main > p').text()).toBe(
        'Enabled slow page'
      )
    })
  })

  it('keeps the disabled issue visible while compiling', async () => {
    const browser = await next.browser('/app/build-indicator/issue')

    await waitForIssue(browser)
    await toggleDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-preferences]').click()
    await browser.elementByCss('[data-hide-dev-tools]').click()
    await waitForIssue(browser)

    await installCheckCompilingKeepsDisabledIssue(browser)
    await browser.elementByCss('#to-disabled-slow').click()

    await retry(async () => {
      expect(
        await browser.eval(
          `sessionStorage.getItem('keptDisabledIssueWhileCompiling')`
        )
      ).toBe('true')
    })

    await retry(async () => {
      expect(await browser.elementByCss('main > p').text()).toBe(
        'Disabled slow page'
      )
    })
  })
})
