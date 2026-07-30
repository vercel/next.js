import { isNextDev, nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
;(isNextDev ? describe.skip : describe)('html-limited-bots-ppr', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should serve a fully dynamic render with blocking metadata to a configured HTML-limited bot', async () => {
    const res = await next.fetch('/partial', {
      headers: {
        'user-agent': 'MyBot',
      },
    })

    expect(res.status).toBe(200)
    // The deployment proxy consumes this internal header.
    if (!isNextDeploy) {
      expect(res.headers.get('x-nextjs-postponed')).toBeNull()
    }

    const $ = cheerio.load(await res.text())
    expect($('head title').text()).toBe('dynamic title')
    expect($('body title').length).toBe(0)
    expect($('#dynamic-content').text()).toBe('dynamic content')
    expect($('#dynamic-fallback').length).toBe(0)
  })

  it('should serve the partially prerendered shell with streamed metadata to regular user agents', async () => {
    const res = await next.fetch('/partial')

    expect(res.status).toBe(200)
    // The deployment proxy consumes this internal header.
    if (!isNextDeploy) {
      expect(res.headers.get('x-nextjs-postponed')).toBe('1')
    }

    const $ = cheerio.load(await res.text())
    expect($('body title').text()).toBe('dynamic title')
    expect($('#dynamic-content').text()).toBe('dynamic content')
  })

  it('should continue streaming the body after blocking metadata for a configured HTML-limited bot', async () => {
    const abortController = new AbortController()
    let body:
      | (AsyncIterable<Uint8Array> & {
          destroy: () => void
        })
      | undefined

    try {
      const res = await next.fetch('/partial?stream=1', {
        headers: {
          'user-agent': 'MyBot',
        },
        signal: abortController.signal,
      })

      expect(res.status).toBe(200)
      // The deployment proxy consumes this internal header.
      if (!isNextDeploy) {
        expect(res.headers.get('x-nextjs-postponed')).toBeNull()
      }
      expect(res.body).not.toBeNull()

      body = res.body! as unknown as AsyncIterable<Uint8Array> & {
        destroy: () => void
      }
      let initialHtml = ''

      for await (const chunk of body) {
        initialHtml += Buffer.from(chunk).toString()
        if (initialHtml.includes('dynamic-fallback')) {
          break
        }
      }

      expect(initialHtml).toContain('<title>dynamic title</title>')
      expect(initialHtml).toContain('dynamic-fallback')
      expect(initialHtml).not.toContain('dynamic-content')
    } finally {
      abortController.abort()
      body?.destroy()
    }
  })
})
