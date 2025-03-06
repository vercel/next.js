import type { RequestInit as NodeFetchRequestInit } from 'node-fetch'
import { nextTestSetup } from 'e2e-utils'

describe('route handlers - redirect handling', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe.each([
    { name: 'redirect', status: 307, href: '/api-redirect' },
    {
      name: 'permanentRedirect',
      status: 308,
      href: '/api-redirect-permanent',
    },
  ])('route handlers - $name', ({ status: expectedStatus, href }) => {
    const cases: {
      name: string
      options: NodeFetchRequestInit
      expectedStatus: number
    }[] = [
      {
        name: 'GET',
        options: {},
        expectedStatus,
      },
      {
        name: 'POST json',
        options: {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        },
        expectedStatus,
      },
      {
        name: 'POST plaintext',
        options: {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: 'hello',
        },
        expectedStatus,
      },
      {
        name: 'POST multipart',
        options: {
          method: 'POST',
          headers: { 'content-type': 'multipart/form-data' },
          // @ts-expect-error: some bizarre type resolution issue, idk
          body: new FormData(),
        },
        expectedStatus: 303, // special case. it's weird that we do this, but that's the current behavior
      },
      {
        name: 'POST urlencoded',
        options: {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ foo: 'bar' }),
        },
        expectedStatus: 303, // special case. it's weird that we do this, but that's the current behavior
      },
    ]

    it.each(cases)('$name', async ({ options, expectedStatus }) => {
      const response = await next.fetch(href, {
        redirect: 'manual',
        ...options,
      })
      expect(response.status).toBe(expectedStatus)

      const locationHeader = response.headers.get('location')
      expect(locationHeader).toBeTruthy()
      const redirectUrl = new URL(locationHeader!)
      expect(redirectUrl.pathname + redirectUrl.search).toBe(
        '/redirect-target?success=true'
      )
    })
  })
})
