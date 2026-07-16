import { nextTestSetup } from 'e2e-utils'

// The shell byte boundary (the `a` field on a segment prefetch response) is
// only produced by build-time prerendering, so the boundary assertions only
// run in `next start` mode.
describe('segment-prefetch-shell-boundary', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  async function fetchSegmentPrefetchBytes(
    pathname: string,
    segmentKey: string
  ): Promise<Buffer> {
    const res = await next.fetch(pathname, {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-Segment-Prefetch': segmentKey,
      },
    })
    expect(res.status).toBe(200)
    return Buffer.from(await res.arrayBuffer())
  }

  // Reads the response's shell byte boundary from the raw Flight stream: the
  // envelope contains `"a":"$@<id>"` and a later row `<id>:<value>` resolves
  // it to a number (byte offset) or null (shell == full response).
  function readShellByteBoundary(responseBytes: Buffer): number | null {
    const text = responseBytes.toString('utf8')
    const refMatch = text.match(/"a":"\$@([0-9a-f]+)"/)
    expect(refMatch).not.toBeNull()
    const rowId = refMatch![1]
    const rowMatch = text.match(new RegExp(`(?:^|\\n)${rowId}:(null|\\d+)\\n`))
    expect(rowMatch).not.toBeNull()
    return rowMatch![1] === 'null' ? null : Number(rowMatch![1])
  }

  it('renders the param page', async () => {
    const $ = await next.render$('/blog/param-marker-alpha')
    expect($('#static-content').text()).toBe('Static page content')
    expect($('#param-content').text()).toBe('Param value: param-marker-alpha')
  })

  if (!isNextStart) {
    it('only runs boundary assertions in start mode', () => {})
    return
  }

  it('emits a shell byte boundary that splits param-dependent content out of a segment prefetch response', async () => {
    const bytes = await fetchSegmentPrefetchBytes(
      '/blog/param-marker-alpha',
      '/blog/$d$slug/__PAGE__'
    )
    const boundary = readShellByteBoundary(bytes)
    // The page reads a param, so the shell must be a strict prefix.
    expect(typeof boundary).toBe('number')
    expect(boundary).toBeGreaterThan(0)
    expect(boundary).toBeLessThan(bytes.byteLength)

    const shellPrefix = bytes.subarray(0, boundary as number).toString('utf8')
    const concreteRemainder = bytes
      .subarray(boundary as number)
      .toString('utf8')

    // The shell prefix contains all the param-independent content...
    expect(shellPrefix).toContain('Static page content')
    expect(shellPrefix).toContain('Blog layout heading')
    expect(shellPrefix).toContain('Loading param...')
    // ...but not the param-dependent content, which is only emitted after
    // the boundary.
    expect(shellPrefix).not.toContain('param-marker-alpha')
    expect(concreteRemainder).toContain('param-marker-alpha')

    // The boundary falls on a Flight row edge: the remainder starts with a
    // new row (`<hex id>:`).
    expect(concreteRemainder).toMatch(/^[0-9a-f]+:/)
  })

  it('resolves the boundary to null on static routes (shell == full response)', async () => {
    const bytes = await fetchSegmentPrefetchBytes('/', '/__PAGE__')
    const boundary = readShellByteBoundary(bytes)
    expect(boundary).toBeNull()
  })
})
