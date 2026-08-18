import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Invalid or malformed requests that reach the Server Action handler should be
// answered with a 4xx status, not a 500. These are all client faults (skew,
// hand-crafted requests, automated scanner traffic) and reporting them as
// server errors both misleads users and pollutes production error monitoring.
describe('server actions - invalid requests', () => {
  const missingActionId = '0'.repeat(42)

  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  let cliOutputPosition: number = 0
  beforeEach(() => {
    cliOutputPosition = next.cliOutput.length
  })
  const getLogs = () => next.cliOutput.slice(cliOutputPosition)

  /**
   * Reads a real, currently-valid action ID out of the rendered form, so that
   * the malformed-body cases get past ID validation and actually reach the
   * Flight decoder.
   */
  const getValidActionId = async () => {
    const html = await next.render('/')
    const match = html.match(/\$ACTION_ID_([0-9a-f]+)/)
    if (!match) {
      throw new Error('Could not find a server action ID in the rendered page')
    }
    return match[1]
  }

  const multipartBody = (fields: Record<string, string>) => {
    const boundary = '----FormBoundaryTest'
    const body =
      Object.entries(fields)
        .map(
          ([name, value]) =>
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
        )
        .join('') + `--${boundary}--\r\n`

    return {
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    }
  }

  describe('multipart POST that is not a server action', () => {
    // Deployed 404s are served as a static route which rejects POST with a 405.
    if (!isNextDeploy) {
      it('should 404 rather than 500 when POSTing form data to a nonexistent route', async () => {
        const { headers, body } = multipartBody({ file: 'contents' })
        const res = await next.fetch('/non-existent-route', {
          method: 'POST',
          headers,
          body,
        })

        expect(res.status).toBe(404)
        // Warnings are expected here; an error is not. Matching the error
        // marker alone would also match the dev server's experiments banner.
        expect(getLogs()).not.toContain('⨯ Error')
      })
    }

    it('should 404 rather than 500 when POSTing form data to an existing page', async () => {
      const { headers, body } = multipartBody({ file: 'contents' })
      const res = await next.fetch('/', { method: 'POST', headers, body })

      expect(res.status).toBe(404)
      expect(res.headers.get('x-nextjs-action-not-found')).toBe('1')
    })

    it('should 404 rather than 500 for an empty multipart body', async () => {
      const res = await next.fetch('/', {
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data; boundary=----FormBoundaryTest',
        },
        body: '------FormBoundaryTest--\r\n',
      })

      expect(res.status).toBe(404)
    })

    it('should 404 rather than 500 for an unrecognized MPA action id', async () => {
      const { headers, body } = multipartBody({
        [`$ACTION_ID_${missingActionId}`]: '',
      })
      const res = await next.fetch('/', { method: 'POST', headers, body })

      expect(res.status).toBe(404)
      expect(res.headers.get('x-nextjs-action-not-found')).toBe('1')

      if (!isNextDeploy) {
        // The log names the unresolvable id, which is what makes a skew report
        // actionable.
        await retry(async () =>
          expect(getLogs()).toContain(
            `Failed to find Server Action "${missingActionId}". This request might be from an older or newer deployment.`
          )
        )
      }
    })
  })

  describe('malformed request body', () => {
    // A valid Next-Action header with a body the Flight decoder can't parse
    // used to throw a SyntaxError and surface as a 500.
    it.each([
      { description: 'truncated JSON', body: '[' },
      { description: 'invalid JSON', body: '[zxc]' },
      { description: 'a bare string', body: 'not-json-at-all' },
    ])(
      'should 400 rather than 500 for a fetch action with $description',
      async ({ body }) => {
        const actionId = await getValidActionId()
        const res = await next.fetch('/', {
          method: 'POST',
          headers: {
            accept: 'text/x-component',
            'content-type': 'text/plain;charset=UTF-8',
            'next-action': actionId,
            origin: next.url,
          },
          body,
        })

        expect(res.status).toBe(400)

        if (!isNextDeploy) {
          expect(getLogs()).not.toContain('⨯ SyntaxError')
          expect(getLogs()).toContain(
            'Failed to decode a Server Action request'
          )
        }
      }
    )

    // The decoder quotes the offending input in its message, so the log line
    // carries bytes from the request body. They have to be escaped, or a
    // crafted body can forge log lines.
    it('should not let a crafted body forge a log line', async () => {
      const actionId = await getValidActionId()
      const forged = '\n  ⨯ Error: forged by the request body\n'
      const res = await next.fetch('/', {
        method: 'POST',
        headers: {
          accept: 'text/x-component',
          'content-type': 'text/plain;charset=UTF-8',
          'next-action': actionId,
          origin: next.url,
        },
        body: forged + '[',
      })

      expect(res.status).toBe(400)

      if (!isNextDeploy) {
        const logs = getLogs()
        expect(logs).toContain('Failed to decode a Server Action request')
        // The decoder echoes the start of the body, so an unescaped message
        // would break here and leave a line of the attacker's choosing. The
        // escaped form keeps those bytes on the warning's own line.
        expect(
          logs.split('\n').some((line) => line.startsWith('  ⨯ Error'))
        ).toBe(false)
      }
    })

    it('should 400 rather than 500 for a fetch action with an unparseable multipart body', async () => {
      const actionId = await getValidActionId()
      const res = await next.fetch('/', {
        method: 'POST',
        headers: {
          accept: 'text/x-component',
          'content-type': 'multipart/form-data; boundary=----FormBoundaryTest',
          'next-action': actionId,
          origin: next.url,
        },
        // Truncated: the closing boundary is missing.
        body: '------FormBoundaryTest\r\nContent-Disposition: form-data;',
      })

      expect(res.status).toBe(400)
    })
  })

  describe('malformed origin header', () => {
    it.each([
      { description: 'an origin with no host', origin: 'http://' },
      { description: 'a non-URL origin', origin: 'not-a-url' },
      { description: 'an empty-scheme origin', origin: '://example.com' },
    ])('should 400 rather than 500 for $description', async ({ origin }) => {
      const { headers, body } = multipartBody({ file: 'contents' })
      const res = await next.fetch('/', {
        method: 'POST',
        headers: { ...headers, origin },
        body,
      })

      expect(res.status).toBe(400)

      if (!isNextDeploy) {
        expect(getLogs()).not.toContain('TypeError')
        expect(getLogs()).not.toContain('Invalid URL')
      }
    })
  })

  describe('hostile action id', () => {
    // An id only has to be 42 characters long to pass validation; its bytes are
    // never checked. Sent as a multipart field name it can carry anything, so an
    // unescaped id would put control characters, including terminal escape
    // sequences, into the log of whatever ingests stdout.
    it('should escape control characters in the logged action id', async () => {
      const esc = String.fromCharCode(27)
      const hostileActionId = '0'.repeat(20) + esc + '0'.repeat(21)
      expect(hostileActionId).toHaveLength(42)

      const { headers, body } = multipartBody({
        [`$ACTION_ID_${hostileActionId}`]: '',
      })
      const res = await next.fetch('/', { method: 'POST', headers, body })

      expect(res.status).toBe(404)

      if (!isNextDeploy) {
        await retry(async () =>
          expect(getLogs()).toContain('Failed to find Server Action')
        )
        const logs = getLogs()
        // The escaped form is what should reach the log. Asserting the raw id is
        // absent is what makes this fail without the escaping; the log is full
        // of ANSI colour codes, so a bare search for ESC would prove nothing.
        expect(logs).toContain(JSON.stringify(hostileActionId))
        expect(logs).not.toContain(hostileActionId)
      }
    })
  })

  describe('regressions', () => {
    // The same form drives both cases: without JS the browser posts it as an
    // MPA action, with JS React submits it as a fetch action.
    const submitForm = async (
      browser: Awaited<ReturnType<typeof next.browser>>
    ) => {
      expect(await browser.elementByCss('#submitted').text()).toBe('no')

      await browser
        .elementByCss('form#action-form button[type="submit"]')
        .click()

      // The action sets a cookie that the page reads back on re-render.
      await retry(async () => {
        expect(await browser.elementByCss('#submitted').text()).toBe('yes')
      })

      // Neither rejection path should have been taken.
      expect(getLogs()).not.toContain('Failed to find Server Action')
      expect(getLogs()).not.toContain(
        'Failed to decode a Server Action request'
      )
    }

    it('should still execute a genuine MPA form submission', async () => {
      await submitForm(await next.browser('/', { disableJavaScript: true }))
    })

    it('should still execute a genuine fetch action', async () => {
      await submitForm(await next.browser('/'))
    })
  })
})
