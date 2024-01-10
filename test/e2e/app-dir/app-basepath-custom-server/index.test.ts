import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
import { Request, Response } from 'playwright-chromium'

createNextDescribe(
  'custom-app-server-action-redirect',
  {
    files: join(__dirname, 'custom-server'),
    skipDeployment: true,
    startCommand: 'node server.js',
    dependencies: {
      'get-port': '5.1.1',
    },
  },
  ({ next }) => {
    it('redirects with basepath properly when server action handler uses `redirect`', async () => {
      const postRequests = []
      const responses = []

      const browser = await next.browser('/base', {
        beforePageLoad(page) {
          page.on('request', (request: Request) => {
            const url = new URL(request.url())
            if (request.method() === 'POST') {
              postRequests.push(`${url.pathname}${url.search}`)
            }
          })

          page.on('response', (response: Response) => {
            const url = new URL(response.url())
            const status = response.status()

            responses.push([url.pathname, status])
          })
        },
      })

      await browser.elementById('submit-server-action-redirect').click()
      await check(() => browser.url(), /another/)

      expect(postRequests).toEqual([`/base`])

      // responses should only have a single 303 redirect in it from the /base path
      // if broken, this will include a 200 from the /base/another indicating a full page redirect
      responses.forEach((res) => {
        expect(res).not.toEqual(['/base/another', 200])
      })
    })
  }
)
