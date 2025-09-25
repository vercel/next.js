import path from 'path'
import { isNextStart, nextTestSetup } from 'e2e-utils'

describe('Undefined default export', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname),
    skipStart: isNextStart,
    skipDeployment: true,
  })

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
  } else {
    it('errors the build with helpful error messages', async () => {
      const { cliOutput, exitCode } = await next.build()

      expect(exitCode).toBe(1)

      expect(cliOutput).toContain(
        `Error occurred prerendering page "/specific-path/1". Read more: https://nextjs.org/docs/messages/prerender-error
Error: The default export is not a React Component in "/specific-path/1/page"`
      )

      expect(cliOutput).toContain(
        `Error occurred prerendering page "/specific-path/2". Read more: https://nextjs.org/docs/messages/prerender-error
Error: The default export is not a React Component in "/specific-path/2/layout"`
      )

      expect(cliOutput).toContain(
        `Error occurred prerendering page "/will-not-found". Read more: https://nextjs.org/docs/messages/prerender-error
Error: The default export is not a React Component in "/will-not-found/not-found"`
      )
    })
  }
})
