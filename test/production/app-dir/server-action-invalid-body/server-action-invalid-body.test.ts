import { nextTestSetup } from 'e2e-utils'

describe('server-action-invalid-body', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getActionId() {
    const manifest = JSON.parse(
      await next.readFile('.next/server/server-reference-manifest.json')
    )
    const actionId = Object.keys(manifest.node)[0]
    expect(actionId).toBeDefined()
    return actionId
  }

  async function postActionBody(actionId: string, body: string) {
    return next.fetch('/', {
      method: 'POST',
      headers: {
        'next-action': actionId,
        'content-type': 'text/plain;charset=UTF-8',
        origin: next.url,
      },
      body,
    })
  }

  it('should run the action for a well-formed body', async () => {
    const res = await postActionBody(await getActionId(), '["x"]')

    expect(res.status).toBe(200)
  })

  it('should respond with 400 when the request body cannot be decoded', async () => {
    // A malformed body means the request itself is bad, so it must not be
    // reported as a server error.
    const res = await postActionBody(await getActionId(), '[')

    expect(res.status).toBe(400)
  })
})
