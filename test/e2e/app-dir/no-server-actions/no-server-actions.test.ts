import { nextTestSetup } from 'e2e-utils'

describe('app-dir - no server actions', () => {
  const missingActionId = '0'.repeat(42)

  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    {
      description: 'a malformed id',
      actionId: 'abc123',
      expectedError:
        'The Server Reference ID did not match the expected format. Received "abc123".\nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
    },
    {
      description: 'a plausible but missing id',
      actionId: missingActionId,
      expectedError: `Failed to find Server Action "${missingActionId}". This request might be from an older or newer deployment.\nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action`,
    },
  ])(
    'should error when triggering a fetch action with $description on an app with no server actions',
    async ({ actionId, expectedError }) => {
      const res = await next.fetch('/', {
        method: 'POST',
        headers: {
          'Next-Action': actionId,
        },
      })

      expect(res.status).toBe(404)
      expect(res.headers.get('x-nextjs-action-not-found')).toBe('1')

      // Runtime logs and custom headers are not forwarded to the client when deployed.
      if (!isNextDeploy) {
        expect(next.cliOutput).toContain(expectedError)
      }
    }
  )

  // The router sends `RSC: 1` alongside `Next-Action` on every fetch action, so
  // this is the shape a real client produces. The action handler answers with a
  // plain-text 404, which the app page then has to serve rather than treat as an
  // unexpected content type.
  it.each([
    { description: 'a malformed id', actionId: 'abc123' },
    { description: 'a plausible but missing id', actionId: missingActionId },
  ])(
    'should 404 rather than throw when triggering an RSC fetch action with $description on an app with no server actions',
    async ({ actionId }) => {
      const res = await next.fetch('/', {
        method: 'POST',
        headers: {
          'Next-Action': actionId,
          RSC: '1',
        },
      })

      expect(res.status).toBe(404)
      expect(res.headers.get('x-nextjs-action-not-found')).toBe('1')

      if (!isNextDeploy) {
        expect(next.cliOutput).not.toContain('Expected RSC response')
      }
    }
  )

  it('should error when triggering an MPA action on an app with no server actions', async () => {
    const formData = new FormData()
    formData.append('test', 'value')

    const res = await next.fetch('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=test',
      },
      // @ts-expect-error: node-fetch types don't seem to like FormData
      body: formData,
    })

    expect(res.status).toBe(404)
    expect(res.headers.get('x-nextjs-action-not-found')).toBe('1')

    // Runtime logs are not available when deployed.
    if (!isNextDeploy) {
      expect(next.cliOutput).toContain(
        'Failed to find Server Action. This request might be from an older or newer deployment.\nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'
      )
    }
  })
})
