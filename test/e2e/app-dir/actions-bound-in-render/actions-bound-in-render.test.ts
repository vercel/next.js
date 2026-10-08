import { nextTestSetup } from 'e2e-utils'

// A progressive enhancement ("no JS") postback: a plain multipart/form-data
// POST that carries the hidden fields React renders for a `useActionState`
// form with a permalink, plus the `Origin` header the browser would send.
async function noJsPostback(
  baseUrl: string,
  pathname: string,
  timeoutMs: number
): Promise<{ status: number; state: string } | 'no-response'> {
  const html = await (await fetch(baseUrl + pathname)).text()

  const hiddenField = (name: string) => {
    const match = html.match(
      new RegExp(`name="\\${name}"[^>]*?value="([^"]*)"`)
    )
    return match ? decodeHtml(match[1]) : ''
  }

  const body = new FormData()
  body.set('$ACTION_REF_1', '')
  body.set('$ACTION_1:0', hiddenField('$ACTION_1:0'))
  body.set('$ACTION_1:1', hiddenField('$ACTION_1:1'))
  body.set('$ACTION_KEY', hiddenField('$ACTION_KEY'))
  body.set('name', 'world')

  try {
    const res = await fetch(baseUrl + pathname, {
      method: 'POST',
      headers: { Origin: baseUrl },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const responseHtml = await res.text()
    return {
      status: res.status,
      state: decodeHtml(
        responseHtml.match(/<pre id="state">([^<]*)/)?.[1] ?? ''
      ),
    }
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return 'no-response'
    }
    throw err
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
}

describe('app-dir - server action bound during the client render', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // The failing case never sends a response, which cannot be asserted
    // against a deployment.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('responds to a no-JS postback when the action reference is stable', async () => {
    const result = await noJsPostback(next.url, '/stable-action', 60_000)

    expect(result).toEqual({
      status: 200,
      state: JSON.stringify({ boundArg: 'bound-arg', name: 'world' }),
    })
  })

  // NOTE: this asserts the current, incorrect behavior. Binding a server
  // action during the client render creates a new bound args promise on every
  // render, so the postback render never settles: the server re-renders in a
  // loop, the request is never answered, and memory grows until the server
  // process dies. Once that is fixed this test has to be updated to expect a
  // 200 response carrying the returned action state (see the stable-action
  // case above).
  it('never responds to a no-JS postback when the action is bound during render', async () => {
    const result = await noJsPostback(next.url, '/bound-in-render', 30_000)

    expect(result).toBe('no-response')
  })
})
