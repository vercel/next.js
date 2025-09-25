import path from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'

describe('Undefined default export', () => {
  const { next, isNextDev } = nextTestSetup({
    files: new FileRef(
      path.join(__dirname, 'fixtures', 'undefined-default-export')
    ),
  })

  // TODO: This is currently always true. It's just here to already indent the
  // code, so that git blame is preserved in the subsequent commit, when we're
  // moving the file.
  if (isNextDev) {
    it('should error if page component does not have default export', async () => {
      const browser = await next.browser('/specific-path/1')

      await expect(browser).toDisplayRedbox(`
       {
         "description": "The default export is not a React Component in "/specific-path/1/page"",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    })

    it('should error if layout component does not have default export', async () => {
      const browser = await next.browser('/specific-path/2')

      await expect(browser).toDisplayRedbox(`
       {
         "description": "The default export is not a React Component in "/specific-path/2/layout"",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    })

    it('should error if not-found component does not have default export when trigger not-found boundary', async () => {
      const browser = await next.browser('/will-not-found')

      await expect(browser).toDisplayRedbox(`
       {
         "description": "The default export is not a React Component in "/will-not-found/not-found"",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    })
  }
})
