import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'

type SelectionTool = {
  name: string
  annotations: { readOnlyHint: boolean }
  execute: () => Promise<{ content: { type: string; text: string }[] }>
}

type SelectionTestWindow = typeof window & {
  __selectionTools: Record<string, SelectionTool>
  __selectionAborted: string[]
  __selectionRegistrations: {
    signal: AbortSignal
    resolve: () => void
    reject: (message: string) => void
  }[]
  __selectionUnhandledRejections: string[]
}

type SelectionContext = {
  url: string
  title: string
  components: {
    id: number
    name: string
    text: string
    tagName: string
    selector: string
    source: { file: string; line: number; column: number } | null
    owners: { name: string }[]
  }[]
}

async function startSelecting(browser: Playwright) {
  await browser.elementByCss('[data-nextjs-dev-tools-button]').click()
  await browser.elementByCss('[data-select-components]').click()
  await browser
    .getByRole('button', { name: 'Stop selecting element', exact: true })
    .waitFor()
}

async function openSelectionMenu(browser: Playwright) {
  await browser
    .getByRole('button', { name: /^(Stop selecting element|Select element)$/ })
    .click({ button: 'right' })
  await browser
    .getByRole('menuitem', { name: 'Copy context', exact: true })
    .waitFor()
}

async function selectionAction(browser: Playwright, name: string) {
  await openSelectionMenu(browser)
  await browser.getByRole('menuitem', { name, exact: true }).click()
}

async function selectedContext(
  browser: Playwright
): Promise<SelectionContext | null> {
  return browser.eval(async () => {
    const tool = (window as SelectionTestWindow).__selectionTools
      .nextjs_get_selected_components
    if (!tool) return null
    const result = await tool.execute()
    return JSON.parse(result.content[0].text)
  })
}

describe('next-devtools-select-components', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function browserWithWebMCP(deferRegistration = false) {
    return next.browser('/', {
      beforePageLoad: async (page) => {
        await page.setViewportSize({ width: 1440, height: 1000 })
        await page.addInitScript((defer) => {
          const testWindow = window as SelectionTestWindow
          testWindow.__selectionTools = {}
          testWindow.__selectionAborted = []
          testWindow.__selectionRegistrations = []
          testWindow.__selectionUnhandledRejections = []
          window.addEventListener('unhandledrejection', (event) => {
            testWindow.__selectionUnhandledRejections.push(String(event.reason))
          })
          Object.defineProperty(document, 'modelContext', {
            configurable: true,
            value: {
              // Model the current Document API: registration is removed by
              // aborting its signal, without an unregisterTool method.
              registerTool(
                tool: SelectionTool,
                options: { signal: AbortSignal }
              ) {
                const isSelectionTool =
                  tool.name === 'nextjs_get_selected_components'
                return new Promise<void>((resolve, reject) => {
                  const registration = {
                    signal: options.signal,
                    resolve: () => {
                      if (options.signal.aborted) {
                        reject(
                          new DOMException('Registration aborted', 'AbortError')
                        )
                        return
                      }
                      if (testWindow.__selectionTools[tool.name]) {
                        reject(
                          new Error('A tool with this name already exists')
                        )
                        return
                      }
                      testWindow.__selectionTools[tool.name] = tool
                      options.signal.addEventListener(
                        'abort',
                        () => {
                          if (testWindow.__selectionTools[tool.name] === tool) {
                            delete testWindow.__selectionTools[tool.name]
                          }
                          if (isSelectionTool) {
                            testWindow.__selectionAborted.push(tool.name)
                          }
                        },
                        { once: true }
                      )
                      resolve()
                    },
                    reject: (message: string) => reject(new Error(message)),
                  }
                  if (isSelectionTool) {
                    testWindow.__selectionRegistrations.push(registration)
                  }
                  // The HMR tools share this registry and must remain available
                  // while selection registration is deliberately delayed.
                  if (!defer || !isSelectionTool) registration.resolve()
                })
              },
            },
          })
        }, deferRegistration)
      },
    })
  }

  it('shares numbered selections with React component names and original source locations', async () => {
    const browser = await browserWithWebMCP()
    expect(await selectedContext(browser)).toBeNull()
    await startSelecting(browser)
    expect(await selectedContext(browser)).toBeNull()
    expect(await browser.locator('[data-react-grab-frontend]').count()).toBe(1)
    expect(
      await browser.locator('[data-react-grab-overlay-canvas]').count()
    ).toBe(1)
    const toolbar = await browser
      .locator('[data-react-grab-toolbar]')
      .boundingBox()
    expect(toolbar.width).toBeLessThan(160)
    expect(toolbar.height).toBeLessThan(80)

    await browser.elementById('hero-title').click()
    await browser.elementById('product-title').click()

    await retry(async () => {
      const context = await selectedContext(browser)
      expect(context).toMatchObject({
        url: `${next.url}/`,
        title: 'Fieldwork — Objects for everyday adventures',
        components: [
          {
            id: 1,
            name: 'HeroCard',
            tagName: 'h1',
            text: expect.stringContaining('More possibility.'),
            source: {
              file: expect.stringContaining('app/components/hero-card.tsx'),
              line: expect.any(Number),
              column: expect.any(Number),
            },
          },
          {
            id: 2,
            name: 'ProductCard',
            tagName: 'h2',
            text: 'The everyday tote',
            source: {
              file: expect.stringContaining('app/components/product-card.tsx'),
              line: expect.any(Number),
              column: expect.any(Number),
            },
          },
        ],
      })
      expect(context.components[0].owners).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'HeroCard' })])
      )
      expect(context.components[0].source.line).toBeGreaterThan(0)
      expect(context.components[0].source.column).toBeGreaterThan(0)
      expect(
        await browser.eval(
          (selector) => document.querySelector(selector)?.id,
          context.components[0].selector
        )
      ).toBe('hero-title')
    })
    expect(
      await browser.eval(
        () =>
          (window as SelectionTestWindow).__selectionTools
            .nextjs_get_selected_components.annotations.readOnlyHint
      )
    ).toBe(true)
    await retry(async () => {
      expect(
        await browser
          .locator('[data-react-grab-selection-label]')
          .allTextContents()
      ).toEqual(
        expect.arrayContaining([expect.stringContaining('#2 ProductCard')])
      )
    })
  })

  it('intercepts page actions while picking and keeps live context after Escape', async () => {
    const browser = await browserWithWebMCP()
    await startSelecting(browser)
    await browser.elementById('hero-link').click()
    await browser.elementById('product-action').click()
    expect(await browser.url()).toBe(`${next.url}/`)
    expect(await browser.elementById('bag-count').text()).toBe('0')

    await browser.keydown('Escape').keyup('Escape')
    await browser
      .getByRole('button', { name: 'Select element', exact: true })
      .waitFor()
    expect((await selectedContext(browser)).components).toHaveLength(2)

    await browser.elementById('product-action').click()
    await retry(async () => {
      expect(await browser.elementById('bag-count').text()).toBe('1')
      const context = await selectedContext(browser)
      expect(context.components[1]).toMatchObject({
        id: 2,
        name: 'ProductCard',
        text: expect.stringMatching(/Add to bag ·\s+1/),
      })
    })
  })

  it('preserves element IDs when reselected and unregisters after the final removal or clear', async () => {
    const browser = await browserWithWebMCP()
    await startSelecting(browser)
    await browser.elementById('hero-title').click()
    await browser.elementById('product-title').click()
    await browser
      .getByRole('button', { name: 'Stop selecting element', exact: true })
      .click()
    // Native renderer controls must never become part of the page selection.
    expect(
      (await selectedContext(browser)).components.map(({ id }) => id)
    ).toEqual([1, 2])
    const picker = browser.getByRole('button', {
      name: 'Select element',
      exact: true,
    })
    await picker.press('Shift+F10')
    await browser
      .getByRole('menuitem', { name: 'Copy context', exact: true })
      .waitFor()
    await browser.keydown('Escape').keyup('Escape')
    await browser
      .getByRole('menuitem', { name: 'Copy context', exact: true })
      .waitFor({ state: 'hidden' })
    await retry(async () => {
      expect(
        await picker.evaluate((element) => element.matches(':focus'))
      ).toBe(true)
    })
    expect(
      (await selectedContext(browser)).components.map(({ id }) => id)
    ).toEqual([1, 2])
    await selectionAction(browser, 'Remove component 1')
    expect(
      (await selectedContext(browser)).components.map(({ id }) => id)
    ).toEqual([2])

    await browser
      .getByRole('button', { name: 'Select element', exact: true })
      .click()
    expect(
      (await selectedContext(browser)).components.map(({ id }) => id)
    ).toEqual([2])
    await browser.elementById('hero-title').click()
    expect(
      (await selectedContext(browser)).components.map(({ id }) => id)
    ).toEqual([2, 1])

    await selectionAction(browser, 'Remove component 2')
    await selectionAction(browser, 'Remove component 1')
    expect(await selectedContext(browser)).toBeNull()

    await browser.elementById('hero-title').click()
    expect((await selectedContext(browser)).components[0].id).toBe(1)
    await selectionAction(browser, 'Clear selection')
    expect(await selectedContext(browser)).toBeNull()
    expect(
      await browser.eval(
        () => (window as SelectionTestWindow).__selectionAborted
      )
    ).toEqual([
      'nextjs_get_selected_components',
      'nextjs_get_selected_components',
    ])
  })

  it('removes detached components and unregisters after client navigation', async () => {
    const browser = await browserWithWebMCP()
    await startSelecting(browser)
    await browser.elementById('hero-title').click()
    await browser.elementById('product-title').click()
    await browser
      .getByRole('button', { name: 'Stop selecting element', exact: true })
      .click()
    await browser.elementById('toggle-product').click()

    await retry(async () => {
      expect(
        (await selectedContext(browser)).components.map(({ id }) => id)
      ).toEqual([1])
      expect(
        await browser
          .locator('[data-react-grab-selection-label]')
          .allTextContents()
      ).not.toEqual(
        expect.arrayContaining([expect.stringContaining('#2 ProductCard')])
      )
    })

    await browser.elementById('hero-link').click()
    await browser.elementById('collection-title')
    await retry(async () => {
      expect(await selectedContext(browser)).toBeNull()
    })
    // This is an App Router transition: the same document's registration was
    // explicitly aborted, rather than merely lost during a full page reload.
    expect(
      await browser.eval(
        () => (window as SelectionTestWindow).__selectionAborted
      )
    ).toEqual(['nextjs_get_selected_components'])

    await startSelecting(browser)
    await browser.elementById('collection-title').click()
    await retry(async () => {
      expect((await selectedContext(browser)).components).toEqual([
        expect.objectContaining({
          name: 'Collection',
          source: {
            file: expect.stringContaining('app/collection/page.tsx'),
            line: expect.any(Number),
            column: expect.any(Number),
          },
        }),
      ])
    })
  })

  it('cancels pending registration and ignores stale completions after reselection', async () => {
    const browser = await browserWithWebMCP(true)
    await startSelecting(browser)
    await browser.elementById('hero-title').click()
    expect(await selectedContext(browser)).toBeNull()
    await openSelectionMenu(browser)
    expect(
      await browser.locator('[data-react-grab-context-menu]').textContent()
    ).toContain('Copy to share')
    await browser
      .getByRole('menuitem', { name: 'Clear selection', exact: true })
      .click()
    expect(
      await browser.eval(() => {
        const registrations = (window as SelectionTestWindow)
          .__selectionRegistrations
        registrations[0].resolve()
        return registrations[0].signal.aborted
      })
    ).toBe(true)
    expect(await selectedContext(browser)).toBeNull()

    await browser.elementById('hero-title').click()
    await selectionAction(browser, 'Clear selection')
    await browser.elementById('product-title').click()
    await browser.eval(() => {
      const registrations = (window as SelectionTestWindow)
        .__selectionRegistrations
      registrations[2].resolve()
    })
    await retry(async () => {
      expect((await selectedContext(browser)).components).toEqual([
        expect.objectContaining({ name: 'ProductCard' }),
      ])
    })
    // The earlier attempt rejects after the current registration succeeded.
    await browser.eval(() => {
      ;(window as SelectionTestWindow).__selectionRegistrations[1].reject(
        'Cancelled registration'
      )
    })
    await openSelectionMenu(browser)
    expect(
      await browser.locator('[data-react-grab-context-menu]').textContent()
    ).toContain('Shared with agents')
    expect(
      await browser.eval(() => {
        const testWindow = window as SelectionTestWindow
        return {
          registered: Object.keys(testWindow.__selectionTools).filter(
            (name) => name === 'nextjs_get_selected_components'
          ),
          attempts: testWindow.__selectionRegistrations.length,
          staleAborted: testWindow.__selectionRegistrations[1].signal.aborted,
          unhandled: testWindow.__selectionUnhandledRejections,
        }
      })
    ).toEqual({
      registered: ['nextjs_get_selected_components'],
      attempts: 3,
      staleAborted: true,
      unhandled: [],
    })
    await browser
      .getByRole('menuitem', { name: 'Clear selection', exact: true })
      .click()
    expect(await selectedContext(browser)).toBeNull()
  })

  it('preserves an application-owned tool when registration rejects', async () => {
    const browser = await browserWithWebMCP()
    await browser.eval(() => {
      const tools = (window as SelectionTestWindow).__selectionTools
      tools.nextjs_get_selected_components = {
        name: 'nextjs_get_selected_components',
        annotations: { readOnlyHint: true },
        execute: async () => ({
          content: [{ type: 'text', text: 'application-owned' }],
        }),
      }
      // Some older implementations also expose name-based removal. Never use
      // it after a conflict: that would remove the application's registration.
      const context = (
        document as Document & {
          modelContext: { unregisterTool?: (name: string) => void }
        }
      ).modelContext
      context.unregisterTool = (name) => {
        delete tools[name]
      }
    })
    await startSelecting(browser)
    await browser.elementById('hero-title').click()
    await openSelectionMenu(browser)
    expect(
      await browser.locator('[data-react-grab-context-menu]').textContent()
    ).toContain('Copy to share')
    await browser
      .getByRole('menuitem', { name: 'Clear selection', exact: true })
      .click()
    expect(
      await browser.eval(async () => {
        const testWindow = window as SelectionTestWindow
        const tool = testWindow.__selectionTools.nextjs_get_selected_components
        return {
          result: await tool?.execute(),
          attempts: testWindow.__selectionRegistrations.length,
          unhandled: testWindow.__selectionUnhandledRejections,
        }
      })
    ).toEqual({
      result: { content: [{ type: 'text', text: 'application-owned' }] },
      attempts: 1,
      unhandled: [],
    })
  })

  it('still supports selecting components in browsers without WebMCP', async () => {
    const browser = await next.browser('/', {
      beforePageLoad: async (page) => {
        await page.addInitScript(() => {
          for (const target of [document, navigator]) {
            Object.defineProperty(target, 'modelContext', {
              configurable: true,
              value: undefined,
            })
          }
        })
      },
    })
    await startSelecting(browser)
    await browser.elementById('hero-title').click()
    await browser
      .getByRole('button', { name: 'Stop selecting element', exact: true })
      .click()
    await retry(async () => {
      expect(
        await browser
          .locator('[data-react-grab-selection-label]')
          .allTextContents()
      ).toEqual(
        expect.arrayContaining([expect.stringContaining('#1 HeroCard')])
      )
    })
    await openSelectionMenu(browser)
    expect(
      await browser.locator('[data-react-grab-context-menu]').textContent()
    ).toContain('Copy to share')
    await browser
      .getByRole('menuitem', { name: 'Clear selection', exact: true })
      .click()
    expect(await browser.locator('[data-react-grab-toolbar]').count()).toBe(0)
  })
})
