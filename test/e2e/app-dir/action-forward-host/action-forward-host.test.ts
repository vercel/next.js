import { nextTestSetup } from 'e2e-utils'
import http from 'http'

// A host that is deliberately not the origin the server listens on, so that a
// forwarded action's `headers().get('host')` is distinguishable from the
// internal loopback origin.
const HOST = 'example.test'

// The host a client would try to smuggle in through `x-forwarded-host`.
const FORGED_HOST = 'forged.test'

type ObservedHeaders = {
  host: string | null
  xForwardedHost: string | null
  actionForwarded: string | null
}

describe('server action forwarding - original host', () => {
  // The behaviour under test only exists on a self-hosted server: the action is
  // forwarded over a private loopback fetch to the server's own origin. The
  // test needs a local port to connect to, has to send a `Host` that isn't the
  // one it connected to, and reads the action's output from the running
  // server's stdout — none of which a deployment gives us.
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  // `next.fetch` goes through `undici`, which refuses to set `host` because it
  // is a forbidden header. Use the raw http client so we can send an arbitrary
  // `Host`, the way a reverse proxy in front of `next start` would.
  function postAction(
    pathname: string,
    actionId: string,
    extraHeaders?: Record<string, string>
  ): Promise<{ status: number }> {
    return new Promise((resolve, reject) => {
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: next.appPort,
          path: pathname,
          method: 'POST',
          headers: {
            host: HOST,
            origin: `http://${HOST}`,
            'content-type': 'text/plain;charset=UTF-8',
            'next-action': actionId,
            ...extraHeaders,
          },
        },
        (response) => {
          response.resume()
          response.on('end', () => resolve({ status: response.statusCode! }))
          response.on('error', reject)
        }
      )

      request.on('error', reject)
      request.end('[]')
    })
  }

  // Read the action id out of the rendered form rather than the build manifest,
  // so this works the same in dev and in start.
  async function getActionId(): Promise<string> {
    const html = await next.render('/with-action')
    const match = html.match(/\$ACTION_ID_([0-9a-f]{42})/)

    if (!match) {
      throw new Error(`Could not find an action id in:\n${html}`)
    }

    return match[1]
  }

  async function collectObservedHeaders(
    pathname: string,
    extraHeaders?: Record<string, string>
  ): Promise<ObservedHeaders> {
    const actionId = await getActionId()
    const outputIndex = next.cliOutput.length

    const { status } = await postAction(pathname, actionId, extraHeaders)
    expect(status).toBe(200)

    const output = next.cliOutput.slice(outputIndex)
    const match = output.match(/\[reportHost\](\{.*\})/)

    if (!match) {
      throw new Error(`The action did not run. Server output was:\n${output}`)
    }

    return JSON.parse(match[1])
  }

  it('observes the request host when the action is not forwarded', async () => {
    const observed = await collectObservedHeaders('/with-action')

    // Sanity check: this route bundles the action, so nothing was forwarded.
    expect(observed.actionForwarded).toBeNull()
    expect(observed.host).toBe(HOST)
  })

  it('observes the request host when the action is forwarded to another worker', async () => {
    const observed = await collectObservedHeaders('/without-action')

    // Sanity check: this route does not bundle the action, so the request
    // really did go through the forwarding path.
    expect(observed.actionForwarded).toBe('1')
    expect(observed.xForwardedHost).toBe(HOST)

    // The forward is an internal self-fetch to the loopback origin, which
    // replaces `Host`. The original host must survive it.
    expect(observed.host).toBe(HOST)
  })

  it('ignores a forged forwarding marker', async () => {
    // `x-action-forwarded` is not an internal header, so a client can send it.
    // This request arrives on the public host rather than the origin we forward
    // to, so the marker must not turn `x-forwarded-host` into `host`. `origin`
    // matches the forged `x-forwarded-host` only to get past the CSRF check.
    const observed = await collectObservedHeaders('/with-action', {
      'x-action-forwarded': '1',
      'x-forwarded-host': FORGED_HOST,
      origin: `http://${FORGED_HOST}`,
    })

    expect(observed.xForwardedHost).toBe(FORGED_HOST)
    expect(observed.host).toBe(HOST)
  })
})
