import { nextTestSetup } from 'e2e-utils'

const keyWarning = 'Each child in a list should have a unique "key" prop.'

describe('use-cache-jsx-key-warning', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function captureKeyWarnings(pathname: string, markerId?: string) {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser(pathname, {
      disableBrowserLog: true,
    })

    await browser.eval(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
    )

    const browserWarnings = (await browser.log()).filter((log) =>
      log.message.includes(keyWarning)
    )
    const terminalWarnings = next.cliOutput
      .slice(outputIndex)
      .split('\n')
      .filter((line) => line.includes(keyWarning))
    const renderedText = await browser.eval('document.body.textContent')
    const cacheFillCount = markerId
      ? await browser.eval(
          `document.getElementById(${JSON.stringify(markerId)})?.getAttribute('data-cache-fill-count')`
        )
      : null

    await browser.close()

    return {
      browserWarnings,
      terminalWarnings,
      renderedText,
      cacheFillCount,
    }
  }

  it('does not warn for multiple pass-through JSX slots on misses or hits', async () => {
    const first = await captureKeyWarnings('/', 'cached-shell')
    const second = await captureKeyWarnings('/', 'cached-shell')

    expect(first.browserWarnings).toEqual([])
    expect(first.terminalWarnings).toEqual([])
    expect(second.browserWarnings).toEqual([])
    expect(second.terminalWarnings).toEqual([])
    expect(first.renderedText).toContain('navigation slot')
    expect(first.renderedText).toContain('content slot')
    expect(second.renderedText).toContain('navigation slot')
    expect(second.renderedText).toContain('content slot')
    expect(first.cacheFillCount).not.toBeNull()
    expect(second.cacheFillCount).toBe(first.cacheFillCount)
  })

  it('does not warn when a nested Server Component renders the slots', async () => {
    const { browserWarnings, terminalWarnings, renderedText } =
      await captureKeyWarnings('/nested')

    expect(browserWarnings).toEqual([])
    expect(terminalWarnings).toEqual([])
    expect(renderedText).toContain('nested navigation slot')
    expect(renderedText).toContain('nested content slot')
  })

  it('still warns for a frozen unkeyed list on cache misses and hits', async () => {
    const first = await captureKeyWarnings('/unkeyed-list', 'unkeyed-list')
    const second = await captureKeyWarnings('/unkeyed-list', 'unkeyed-list')

    expect(
      first.browserWarnings.length + first.terminalWarnings.length
    ).toBeGreaterThan(0)
    expect(
      second.browserWarnings.length + second.terminalWarnings.length
    ).toBeGreaterThan(0)
    expect(first.cacheFillCount).not.toBeNull()
    expect(second.cacheFillCount).toBe(first.cacheFillCount)
  })

  it('still warns when a nested component creates the frozen unkeyed list', async () => {
    const first = await captureKeyWarnings(
      '/nested-unkeyed-list',
      'nested-unkeyed-list'
    )
    const second = await captureKeyWarnings(
      '/nested-unkeyed-list',
      'nested-unkeyed-list'
    )

    expect(
      first.browserWarnings.length + first.terminalWarnings.length
    ).toBeGreaterThan(0)
    expect(
      second.browserWarnings.length + second.terminalWarnings.length
    ).toBeGreaterThan(0)
    expect(first.renderedText).toContain('nested first item')
    expect(first.renderedText).toContain('nested second item')
    expect(second.renderedText).toContain('nested first item')
    expect(second.renderedText).toContain('nested second item')
    expect(first.cacheFillCount).not.toBeNull()
    expect(second.cacheFillCount).toBe(first.cacheFillCount)
  })
})
