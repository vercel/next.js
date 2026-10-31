import { nextTestSetup } from 'e2e-utils'
import { randomUUID } from 'node:crypto'
import { retry } from 'next-test-utils'
import cheerio from 'cheerio'

// serverActions.mdx: allowedOrigins matches URL.host, including the port.
// The full form submission exercises admission and action execution through
// the public frontend, without reading a private action manifest.
describe('documented Server Action origin admission', () => {
  const { next, isNextDeploy } = nextTestSetup({ files: __dirname })

  async function actionFields() {
    const $ = await next.render$('/')
    const action = $('input[type="hidden"]')
      .toArray()
      .map((element) => ({
        name: $(element).attr('name')!,
        value: $(element).attr('value') || '',
      }))
      .filter((field) => field.name.startsWith('$ACTION_'))
    expect(action.length).toBeGreaterThan(0)
    return action
  }

  async function submit(
    origin: string | undefined,
    extraHeaders: Record<string, string> = {}
  ) {
    const action = await actionFields()
    const form = new FormData()
    for (const field of action) form.append(field.name, field.value)
    const nonce = randomUUID()
    form.append('nonce', nonce)
    const response = await next.fetch('/', {
      method: 'POST',
      headers: { ...(origin === undefined ? {} : { origin }), ...extraHeaders },
      body: form,
    })
    return { response, nonce, $: cheerio.load(await response.text()) }
  }

  // serverActions.mdx specifies the complete raw body, including multipart
  // boundaries and headers. Construct bytes explicitly instead of estimating
  // FormData overhead or treating a file's size as the total request size.
  for (const bytes of [1024 * 1024 - 1, 1024 * 1024, 1024 * 1024 + 1]) {
    it(
      '[H02] applies the default Action limit to ' +
        bytes +
        ' raw multipart bytes',
      async () => {
        const fields = await actionFields()
        const nonce = 'raw-λ-' + randomUUID()
        const boundary = 'routing-contract-' + randomUUID()
        const prefix = Buffer.from(
          [...fields, { name: 'nonce', value: nonce }]
            .map(
              ({ name, value }) =>
                `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
            )
            .join('') +
            `--${boundary}\r\nContent-Disposition: form-data; name="padding"\r\n\r\n`
        )
        const suffix = Buffer.from(`\r\n--${boundary}--\r\n`)
        const padding = Buffer.alloc(bytes - prefix.length - suffix.length, 'x')
        const body = Buffer.concat([prefix, padding, suffix])
        expect(body.byteLength).toBe(bytes)
        const response = await next.fetch('/', {
          method: 'POST',
          headers: {
            origin: new URL(next.url).origin,
            'content-type': 'multipart/form-data; boundary=' + boundary,
          },
          body,
          signal: AbortSignal.timeout(15000),
        })
        const $ = cheerio.load(await response.text())
        if (bytes <= 1024 * 1024) {
          expect(response.status).toBe(200)
          expect(JSON.parse($('output').text()).nonce).toBe(nonce)
          expect(response.headers.getSetCookie().join(';')).toContain(
            'origin-result='
          )
        } else {
          // The reference documents rejection, without prescribing an HTTP
          // status for each form-action transport.
          expect(response.status).toBeGreaterThanOrEqual(400)
          expect($('output').text()).not.toContain(nonce)
          expect(response.headers.getSetCookie().join(';')).not.toContain(
            'origin-result='
          )
        }
      }
    )
  }

  for (const origin of [
    'https://exact.example.test',
    'https://port.example.test:8443',
    'https://child.single.example.test',
    'https://child.multi.example.test',
    'https://child.region.multi.example.test',
    'https://child.port-wildcard.example.test:8443',
  ]) {
    it(
      '[H08] executes an action for allowlisted origin ' + origin,
      async () => {
        const { response, nonce, $ } = await submit(origin)
        expect(response.status).toBe(200)
        expect(JSON.parse($('output').text()).nonce).toBe(nonce)
        expect(response.headers.getSetCookie().join(';')).toContain(
          'origin-result='
        )
      }
    )
  }

  for (const origin of [
    'https://unknown.example.test',
    'https://exact.example.test:8443',
    'https://child.exact.example.test',
    'https://port.example.test',
    'https://single.example.test',
    'https://a.b.single.example.test',
    'https://multi.example.test',
    'https://child.single.example.test:8443',
    'https://child.port-wildcard.example.test',
    'https://child.port-wildcard.example.test:9443',
  ]) {
    it('[H08] rejects nonmatching origin ' + origin, async () => {
      const { response, nonce, $ } = await submit(origin)
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect($('output').text()).not.toContain(nonce)
      expect(response.headers.getSetCookie().join(';')).not.toContain(
        'origin-result='
      )
    })
  }

  it('[H08] executes same-origin actions without an allowlist entry', async () => {
    const { response, nonce, $ } = await submit(new URL(next.url).origin)
    expect(response.status).toBe(200)
    expect(JSON.parse($('output').text()).nonce).toBe(nonce)
  })

  it('[H08] permits missing Origin instead of rejecting the action', async () => {
    const offset = next.cliOutput.length
    const { response, nonce, $ } = await submit(undefined)
    expect(response.status).toBe(200)
    expect(JSON.parse($('output').text()).nonce).toBe(nonce)
    if (!isNextDeploy) {
      await retry(() => {
        expect(next.cliOutput.slice(offset)).toContain(
          'Missing `origin` header'
        )
      })
    }
  })

  // Trusted forwarded-host policy belongs to the local frontend boundary;
  // hosting platforms may overwrite this incoming header before Next sees it.
  // @force-gate !deploy
  it('[H08] uses forwarded public host and preserves it for the action', async () => {
    const forwardedHost = 'public.example.test:8443'
    const { response, nonce, $ } = await submit('https://' + forwardedHost, {
      'x-forwarded-host': forwardedHost,
    })
    expect(response.status).toBe(200)
    const result = JSON.parse($('output').text())
    expect(result).toEqual({
      nonce,
      host: new URL(next.url).host,
      forwardedHost,
    })
  })

  // @force-gate !deploy
  it('[H08] rejects Origin matching Host when forwarded host disagrees', async () => {
    const { response } = await submit(new URL(next.url).origin, {
      'x-forwarded-host': 'other.example.test',
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers.getSetCookie().join(';')).not.toContain(
      'origin-result='
    )
  })
})
