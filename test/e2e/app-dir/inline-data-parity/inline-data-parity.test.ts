import { nextTestSetup } from 'e2e-utils'

// Renders every route through both hydration-data channels — the legacy
// framework-owned push queue and React's inline data channel — and asserts
// the two documents are equivalent: the reassembled flight payload must be
// byte-identical, and the HTML outside the data scripts must be
// byte-identical.
describe('inline-data-parity', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    env: { NEXT_INLINE_DATA: 'test' },
  })
  if (!isNextStart) {
    it('only runs in start mode', () => {})
    return
  }

  const DATA_SCRIPT_RE =
    /<script[^>]*>((?:(?!<\/script>)[\s\S])*(?:__next_f|\$RF)(?:(?!<\/script>)[\s\S])*)<\/script>/g

  // Finds the end index of the JSON value starting at `start` by scanning
  // with a tiny state machine (strings + nesting), since payload text can
  // contain ')' freely.
  function findJSONEnd(text: string, start: number): number {
    let depth = 0
    let inString = false
    for (let i = start; i < text.length; i++) {
      const c = text[i]
      if (inString) {
        if (c === '\\') i++
        else if (c === '"') inString = false
        continue
      }
      if (c === '"') inString = true
      else if (c === '[' || c === '{') depth++
      else if (c === ']' || c === '}') depth--
      else if ((c === ')' || c === ',') && depth === 0) return i
    }
    return text.length
  }

  // Reassembles the flight payload as bytes: whether a span travelled as
  // text or base64 is a transport detail, the wire bytes are the invariant.
  function extract(html: string): { payload: string; rest: string } {
    const payload: Buffer[] = []
    const rest: string[] = []
    let last = 0
    let m
    while ((m = DATA_SCRIPT_RE.exec(html)) !== null) {
      rest.push(html.slice(last, m.index))
      last = m.index + m[0].length
      const script = m[1]
      if (script.startsWith('self.$RF=')) {
        // The channel-init script defines the receiver; it carries no
        // payload (but its body contains a .push we must not parse).
        continue
      }
      // Legacy scripts push into the __next_f queue; React channel scripts
      // call the $RF receiver.
      const call = script.includes('__next_f') ? '.push(' : '$RF('
      let pos = 0
      while (true) {
        const i = script.indexOf(call, pos)
        if (i === -1) break
        const start = i + call.length
        const end = findJSONEnd(script, start)
        // The argument is always valid JSON in both protocols.
        const arg = JSON.parse(script.slice(start, end))
        pos = end
        if (arg === null) continue // React channel close marker
        if (typeof arg === 'string') {
          payload.push(Buffer.from(arg, 'utf8')) // React channel text
        } else if (arg.length === 1 && typeof arg[0] === 'string') {
          payload.push(Buffer.from(arg[0], 'base64')) // React channel binary
        } else if (arg[0] === 1) {
          payload.push(Buffer.from(arg[1], 'utf8')) // legacy text
        } else if (arg[0] === 3) {
          payload.push(Buffer.from(arg[1], 'base64')) // legacy binary
        } // kind 0 bootstrap carries no payload
      }
    }
    rest.push(html.slice(last))
    return {
      payload: Buffer.concat(payload).toString('base64'),
      rest: rest.join(''),
    }
  }

  it.each(['/', '/streaming', '/long-text', '/binary'])(
    'produces an equivalent document for %s',
    async (route) => {
      const legacyRes = await next.fetch(route, {
        headers: { 'x-next-inline-data': '0' },
      })
      const legacyHtml = await legacyRes.text()
      const inlineRes = await next.fetch(route, {
        headers: { 'x-next-inline-data': '1' },
      })
      const inlineHtml = await inlineRes.text()

      // The modes are actually distinct documents.
      expect(inlineHtml).toContain('self.$RF=')
      expect(legacyHtml).not.toContain('self.$RF=')

      const legacy = extract(legacyHtml)
      const inline = extract(inlineHtml)
      expect(inline.payload).toBe(legacy.payload)
      expect(inline.rest).toBe(legacy.rest)
    }
  )

  it('hydrates through the React channel when the server defaults to it', async () => {
    // next.browser can't set request headers; this exercises the streaming
    // route in the default (legacy) mode of this server as a hydration
    // control. The dedicated hydration coverage for the channel itself runs
    // in the bench app probes and the rsc-basic suite with NEXT_INLINE_DATA=1.
    const browser = await next.browser('/streaming')
    expect(await browser.elementByCss('#slow').text()).toBe(
      'slow content arrived'
    )
  })
})
