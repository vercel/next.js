/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'
import { createRequestTracker } from 'e2e-utils/request-tracker'
import { retry } from 'next-test-utils'
import { outdent } from 'outdent'

describe('unrecognized server actions', () => {
  const { next, isNextDeploy, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  let cliOutputPosition: number = 0
  beforeEach(() => {
    cliOutputPosition = next.cliOutput.length
  })
  const getLogs = () => {
    return next.cliOutput.slice(cliOutputPosition)
  }

  // This is disabled when deployed because the 404 page will be served as a static route
  // which will not support POST requests, and will return a 405 instead.
  if (!isNextDeploy) {
    it('should 404 when POSTing a non-server-action request to a nonexistent page', async () => {
      const res = await next.fetch('/non-existent-route', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'foo=bar',
      })

      const cliOutput = getLogs()
      expect(cliOutput).not.toContain('TypeError')
      expect(cliOutput).not.toContain(
        'Missing `origin` header from a forwarded Server Actions request'
      )
      expect(res.status).toBe(404)
    })

    it.each([
      {
        // encodeReply encodes simple args as plaintext.
        name: 'plaintext',
        request: {
          contentType: 'text/plain;charset=UTF-8',
          body: '{}',
        },
      },
      {
        // encodeReply encodes complex args as FormData.
        // this body is empty and wouldn't match how react encodes an action, but it should be rejected
        // before we even get to parsing the FormData, so it doesn't really matter.
        name: 'form-data/multipart',
        request: {
          body: new FormData(),
        },
      },
      {
        // we never use urlencoded actions, but we currently have codepaths for it in `handleAction`,
        // so might as well test them.
        name: 'urlencoded',
        request: {
          contentType: 'application/x-www-form-urlencoded',
          body: 'foo=bar',
        },
      },
    ])(
      'should 404 when POSTing a server action with an unrecognized id to a nonexistent page: $name',
      async ({ request: { contentType, body } }) => {
        const res = await next.fetch('/non-existent-route', {
          method: 'POST',
          headers: {
            'next-action': '123',
            ...(contentType ? { 'content-type': contentType } : undefined),
          },
          // @ts-expect-error: node-fetch types don't seem to like FormData
          body,
        })

        expect(res.status).toBe(404)

        const cliOutput = getLogs()
        expect(cliOutput).not.toContain('TypeError')
        expect(cliOutput).not.toContain(
          'Missing `origin` header from a forwarded Server Actions request'
        )
        expect(cliOutput).toInclude(outdent`
          Failed to find Server Action "123". This request might be from an older or newer deployment.
          Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
        `)
      }
    )
  }

  describe('should 404 and log a warning when submitting a server action with an unrecognized ID', () => {
    const testUnrecognizedActionSubmission = async ({
      formId,
      disableJavaScript,
    }: {
      formId: string
      disableJavaScript: boolean
    }) => {
      const browser = await next.browser('/unrecognized-action', {
        disableJavaScript,
      })
      const requestTracker = createRequestTracker(browser)

      const [_, response] = await requestTracker.captureResponse(
        async () =>
          await browser
            .elementByCss(`form#${formId} button[type="submit"]`)
            .click(),
        { request: { method: 'POST', pathname: '/unrecognized-action' } }
      )

      if (!disableJavaScript) {
        // A fetch action, sent via the router.
        expect(response.status()).toBe(404)
        // NOTE: we cannot validate the response text, because playwright hangs on `response.text()` for some reason.
        expect(response.headers()['content-type']).toStartWith('text/plain')

        // calls to unrecognized actions are currently resolved with `undefined` instead of erroring,
        // so that's what the form state should be.
        // (this is a bug, but we're rolling out the fix behind a flag)
        expect(
          await browser.elementByCss(`form#${formId} .form-state`).text()
        ).toBe('undefined')
        expect(await browser.hasElementByCssSelector(`#error-boundary`)).toBe(
          false
        )

        // We responded with a 404, but we shouldn't trigger a not-found (either a custom or a default one)
        expect(await browser.elementByCss('body').text()).not.toContain(
          'Not found'
        )
        expect(await browser.elementByCss('body').text()).not.toContain(
          'my-not-found'
        )

        if (!isNextDeploy) {
          await retry(async () =>
            expect(getLogs()).toInclude(outdent`
              Failed to find Server Action "decafc0ffeebad01". This request might be from an older or newer deployment.
              Read more: https://nextjs.org/docs/messages/failed-to-find-server-action
            `)
          )
        }
      } else {
        // An MPA action, sent without JS.

        // FIXME: Currently, an unrecognized id in an MPA action results in a 500.
        // This is not ideal, and ignores all nested `error.js` files, only showing the topmost one.
        expect(response.status()).toBe(500)
        expect(response.headers()['content-type']).toStartWith('text/html')
        // In dev, the 500 page doesn't have any SSR'd html, so it won't show anything without JS.
        if (!(isNextDev && disableJavaScript)) {
          expect(await browser.elementByCss('body').text()).toContain(
            'Internal Server Error'
          )
        }

        if (!isNextDeploy) {
          // FIXME: For an MPA action, the logs currently show the error thrown by React instead of our custom message with a link to a docs page.
          await retry(async () =>
            expect(getLogs()).toInclude(
              `Error: Could not find the module "decafc0ffeebad01" in the React Server Manifest. This is probably a bug in the React Server Components bundler`
            )
          )
        }
      }
    }

    it.each([
      {
        description: 'js enabled',
        disableJavaScript: false,
      },
      {
        description: 'js disabled',
        disableJavaScript: true,
      },
    ])(
      'server action invoked via form - $description',
      async ({ disableJavaScript }) => {
        await testUnrecognizedActionSubmission({
          formId: 'server-form',
          disableJavaScript,
        })
      }
    )

    // these forms rely on client-side JS, so we can't test them with JS disabled
    it.each([
      {
        description: 'with simple argument',
        formId: 'client-form-simple-argument',
      },
      {
        description: 'with complex argument',
        formId: 'client-form-complex-argument',
      },
    ])('server action invoked from JS - $description', async ({ formId }) => {
      await testUnrecognizedActionSubmission({
        formId,
        disableJavaScript: false,
      })
    })
  })
})
