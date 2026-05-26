import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('hmr-dynamic-component', () => {
  const { next } = nextTestSetup({
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
})
