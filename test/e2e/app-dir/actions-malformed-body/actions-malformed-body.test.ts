import { nextTestSetup } from 'e2e-utils'

// Regression test for https://github.com/vercel/next.js/issues/86945
//
// A malformed Server Action request body (invalid JSON, e.g. from a
// vulnerability scanner probing the endpoint) makes React's flight decoder
// throw a `SyntaxError`. Previously that bubbled up to the generic catch in
// `handleAction` and returned HTTP 500. It should be a 400 Bad Request, since
// the fault is in the client's request, not the server.
//
// We exercise all four fetch-action decode sites:
//   - node  runtime, text/plain body      -> decodeReply(string)
//   - node  runtime, multipart body       -> decodeReplyFromBusboy
//   - edge  runtime, text/plain body      -> decodeReply(string)
//   - edge  runtime, multipart body       -> decodeReply(formData)
describe('server action malformed request body', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // The action id is rendered into the page as a `$ACTION_ID_<hash>` field.
  // Scrape it so we can target a *recognized* action with a malformed body.
  async function getActionId(pathname: string): Promise<string> {
    const html = await next.render(pathname)
    const match = html.match(/\$ACTION_ID_([0-9a-f]+)/)
    if (!match) {
      throw new Error(`Could not find an action id in the HTML for ${pathname}`)
    }
    return match[1]
  }

  describe.each([
    { runtime: 'nodejs', pathname: '/' },
    { runtime: 'edge', pathname: '/edge' },
  ])('$runtime runtime', ({ pathname }) => {
    it('returns 400 for a malformed non-multipart (text) body', async () => {
      const actionId = await getActionId(pathname)

      const res = await next.fetch(pathname, {
        method: 'POST',
        headers: {
          'next-action': actionId,
          'content-type': 'text/plain;charset=UTF-8',
        },
        body: '[', // invalid JSON
      })

      expect(res.status).toBe(400)
    })

    it('returns 400 for a malformed multipart body', async () => {
      const actionId = await getActionId(pathname)

      const boundary = '----nextMalformedBodyBoundary'
      const body =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="0"\r\n\r\n` +
        `[zxc]\r\n` + // invalid JSON inside the form field
        `--${boundary}--\r\n`

      const res = await next.fetch(pathname, {
        method: 'POST',
        headers: {
          'next-action': actionId,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      })

      expect(res.status).toBe(400)
    })
  })

  // Guard the ordering: an *unrecognized* action id is rejected (404) before we
  // ever try to decode the body, so a malformed body must not turn that into a
  // 400. This proves the 400 only applies to recognized actions with bad input.
  it('still returns 404 for an unrecognized action id, even with a malformed body', async () => {
    const res = await next.fetch('/', {
      method: 'POST',
      headers: {
        'next-action': 'decafc0ffeebad01',
        'content-type': 'text/plain;charset=UTF-8',
      },
      body: '[',
    })

    expect(res.status).toBe(404)
  })
})
