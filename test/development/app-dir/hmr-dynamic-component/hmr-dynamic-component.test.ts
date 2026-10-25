import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

describe('hmr-dynamic-component', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
    patchFileDelay: 500,
  })

  it('should update text in a dynamically-imported client component without a full reload', async () => {
    const browser = await next.browser('/')
    const componentPath = join('app', 'components', 'dynamic.tsx')
    const originalContent = await next.readFile(componentPath)
    try {
      await retry(async () => {
        const div = await browser.elementByCss('#dynamic-component')
        expect(await div.text()).toContain('Dynamic Component')
      })

      const timeOrigin = await browser.eval('performance.timeOrigin')

      const editedContent = originalContent.replace(
        'Dynamic Component',
        'Dynamic Component UPDATED'
      )

      await next.patchFile(componentPath, editedContent)

      await retry(async () => {
        const div = await browser.elementByCss('#dynamic-component')
        expect(await div.text()).toContain('Dynamic Component UPDATED')
      }, 10000)

      // Ensure the page was updated via HMR and not a full reload
      expect(await browser.eval('performance.timeOrigin')).toEqual(timeOrigin)
    } finally {
      await next.patchFile(componentPath, originalContent)
    }
  })

  it('should update text via HMR after loading a button-triggered dynamic component', async () => {
    const browser = await next.browser('/lazy')
    const componentPath = join('app', 'components', 'dynamic.tsx')
    const originalContent = await next.readFile(componentPath)
    try {
      // Click button to trigger the dynamic import
      await browser.elementByCss('#load-button').click()

      await retry(async () => {
        const div = await browser.elementByCss('#dynamic-component')
        expect(await div.text()).toContain('Dynamic Component')
      })

      const timeOrigin = await browser.eval('performance.timeOrigin')

      await next.patchFile(
        componentPath,
        originalContent.replace(
          'Dynamic Component',
          'Dynamic Component UPDATED'
        )
      )

      await retry(async () => {
        const div = await browser.elementByCss('#dynamic-component')
        expect(await div.text()).toContain('Dynamic Component UPDATED')
      }, 10000)

      // Ensure the page was updated via HMR and not a full reload
      expect(await browser.eval('performance.timeOrigin')).toEqual(timeOrigin)
    } finally {
      await next.patchFile(componentPath, originalContent)
    }
  })

  it('should load updated code when button is clicked after a code change', async () => {
    const browser = await next.browser('/lazy')
    const componentPath = join('app', 'components', 'dynamic.tsx')
    const originalContent = await next.readFile(componentPath)
    try {
      // Patch the file before the dynamic component has been loaded
      await next.patchFile(
        componentPath,
        originalContent.replace(
          'Dynamic Component',
          'Dynamic Component PRE-LOADED'
        )
      )

      // Now click the button — the component should load with the updated code
      await browser.elementByCss('#load-button').click()

      await retry(async () => {
        const div = await browser.elementByCss('#dynamic-component')
        expect(await div.text()).toContain('Dynamic Component PRE-LOADED')
      }, 10000)
    } finally {
      await next.patchFile(componentPath, originalContent)
    }
  })

  it('should update styles in a dynamically-imported client component via HMR', async () => {
    const browser = await next.browser('/')
    const cssPath = join('app', 'components', 'dynamic.module.css')
    const originalCss = await next.readFile(cssPath)
    try {
      await retry(async () => {
        const div = await browser.elementByCss('#dynamic-component')
        expect(await div.text()).toContain('Dynamic Component')
      })

      // Verify initial style
      await retry(async () => {
        const color = await browser.eval(
          `window.getComputedStyle(document.getElementById('dynamic-component')).color`
        )
        expect(color).toBe('rgb(255, 0, 0)')
      })

      const timeOrigin = await browser.eval('performance.timeOrigin')

      await next.patchFile(
        cssPath,
        originalCss.replace('color: red', 'color: blue')
      )

      await retry(async () => {
        const color = await browser.eval(
          `window.getComputedStyle(document.getElementById('dynamic-component')).color`
        )
        expect(color).toBe('rgb(0, 0, 255)')
      }, 10000)

      // Ensure the update was via HMR and not a full reload
      expect(await browser.eval('performance.timeOrigin')).toEqual(timeOrigin)
    } finally {
      await next.patchFile(cssPath, originalCss)
    }
  })
  if (isTurbopack && isNextDev) {
    it('should not lose an edit while establishing the client HMR subscription', async () => {
      const componentPath = join('app', 'components', 'dynamic.tsx')
      const absoluteComponentPath = join(next.testDir, componentPath)
      const originalContent = await next.readFile(componentPath)
      const graphDirectory = join(
        next.testDir,
        'app',
        'components',
        'hmr-subscription-race'
      )
      const moduleCount = 800

      mkdirSync(graphDirectory, { recursive: true })
      for (let index = 0; index < moduleCount; index++) {
        writeFileSync(
          join(graphDirectory, `module-${index}.ts`),
          `export default ${index}\n`
        )
      }

      const createComponent = (label: string) => `
'use client'

import styles from './dynamic.module.css'
${Array.from(
  { length: moduleCount },
  (_, index) =>
    `import value${index} from './hmr-subscription-race/module-${index}'`
).join('\n')}

const values = [${Array.from(
        { length: moduleCount },
        (_, index) => `value${index}`
      ).join(', ')}]

export default function Dynamic() {
  return (
    <div id="dynamic-component" className={styles.dynamic}>
      HMR subscription ${label} {values.length}
    </div>
  )
}
`

      try {
        await next.patchFile(componentPath, createComponent('before'))

        const subscriptionPaths = new Set<string>()
        let editTriggered = false
        let pageLoads = 0

        const browser = await next.browser('/', {
          beforePageLoad(page: Playwright.Page) {
            page.on('load', () => {
              pageLoads++
            })
            page.on('websocket', (ws) => {
              if (!ws.url().includes('/_next/hmr')) {
                return
              }
              ws.on('framesent', (frame) => {
                const payload =
                  typeof frame.payload === 'string'
                    ? frame.payload
                    : frame.payload.toString('utf8')
                try {
                  const message = JSON.parse(payload)
                  if (
                    message?.type === 'turbopack-subscribe' &&
                    typeof message?.path === 'string' &&
                    message.path.endsWith('.js')
                  ) {
                    subscriptionPaths.add(message.path)
                    if (subscriptionPaths.size === 2 && !editTriggered) {
                      editTriggered = true
                      writeFileSync(
                        absoluteComponentPath,
                        createComponent('after')
                      )
                    }
                  }
                } catch {
                  // Non-JSON frames are unrelated to Turbopack subscriptions.
                }
              })
            })
          },
        })

        await retry(async () => {
          expect(editTriggered).toBe(true)
          const div = await browser.elementByCss('#dynamic-component')
          expect(await div.text()).toContain(
            `HMR subscription after ${moduleCount}`
          )
        }, 10000)

        // The edit must arrive through HMR, not a recovery reload.
        expect(pageLoads).toBe(1)
      } finally {
        await next.patchFile(componentPath, originalContent)
      }
    })
  } else {
    it.skip('subscription race is Turbopack development-mode only', () => {})
  }
})
