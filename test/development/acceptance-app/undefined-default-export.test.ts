import path from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { createSandbox } from 'development-sandbox'

describe('Undefined default export', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    patchFileDelay: 250,
  })

  it('should error if page component does not have default export', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        ['app/(group)/specific-path/server/page.js', 'export const a = 123'],
      ]),
      '/specific-path/server'
    )
    const { browser } = sandbox
    await expect(browser).toDisplayRedbox(`
     {
       "count": 1,
       "description": "Error: The default export is not a React Component.",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/(group)/specific-path/server/page.js (1:1) @ eval
     > 1 | // Check the content of this module for missing export.
         | ^",
       "stack": [
         "eval app/(group)/specific-path/server/page.js (1:1)",
       ],
     }
    `)
  })

  it('should error if layout component does not have default export', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        ['app/(group)/specific-path/server/layout.js', 'export const a = 123'],
        [
          'app/(group)/specific-path/server/page.js',
          'export default function Page() { return <div>Hello</div> }',
        ],
      ]),
      '/specific-path/server'
    )

    const { browser } = sandbox
    await expect(browser).toDisplayRedbox(`
     {
       "count": 1,
       "description": "Error: The default export is not a React Component.",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/(group)/specific-path/server/layout.js (1:1) @ eval
     > 1 | // Check the content of this module for missing export.
         | ^",
       "stack": [
         "eval app/(group)/specific-path/server/layout.js (1:1)",
       ],
     }
    `)
  })

  it('should error if not-found component does not have default export when trigger not-found boundary', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/will-not-found/page.js',
          `
          import { notFound } from 'next/navigation'
          export default function Page() { notFound() }
          `,
        ],
        ['app/will-not-found/not-found.js', 'export const a = 123'],
      ]),
      '/will-not-found'
    )
    const { browser } = sandbox
    await expect(browser).toDisplayRedbox(`
     {
       "count": 1,
       "description": "Error: The default export is not a React Component.",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/will-not-found/not-found.js (1:1) @ eval
     > 1 | // Check the content of this module for missing export.
         | ^",
       "stack": [
         "eval app/will-not-found/not-found.js (1:1)",
       ],
     }
    `)
  })

  it('should error when page component export is not valid', async () => {
    await using sandbox = await createSandbox(next, undefined, '/')
    const { browser } = sandbox

    await next.patchFile('app/page.js', 'const a = 123')

    // The page will fail build and navigate to /_error route of pages router.
    // Wait for the DOM node #__next to be present
    await browser.waitForElementByCss('#__next')

    await expect(browser).toDisplayRedbox(`
     {
       "count": 1,
       "description": "Error: The default export is not a React Component.",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/page.js (1:1) @ eval
     > 1 | // Check the content of this module for missing export.
         | ^",
       "stack": [
         "eval app/page.js (1:1)",
       ],
     }
    `)
  })

  it('should error when page component export is not valid on initial load', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/server-with-errors/page-export-initial-error/page.js',
          'export const a = 123',
        ],
      ]),
      '/server-with-errors/page-export-initial-error'
    )

    const { browser } = sandbox
    await expect(browser).toDisplayRedbox(`
     {
       "count": 1,
       "description": "Error: The default export is not a React Component.",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/server-with-errors/page-export-initial-error/page.js (1:1) @ eval
     > 1 | // Check the content of this module for missing export.
         | ^",
       "stack": [
         "eval app/server-with-errors/page-export-initial-error/page.js (1:1)",
       ],
     }
    `)
  })
})
