import { FileRef, nextTestSetup } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'
import { join } from 'path'
import { createServer, type ServerResponse } from 'node:http'
import { once } from 'node:events'

describe('next/head', () => {
  const { next } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, 'app/pages')),
      components: new FileRef(join(__dirname, 'app/components')),
    },
  })

  it(`should place charset element at the top of <head>`, async () => {
    const browser = await next.browser('/')

    const html = await browser.eval(() => {
      const head = document.querySelector('head')
      return head.innerHTML
    })

    expect(html).toContain(
      `<meta charset="utf-8" data-next-head=""><meta name="viewport" content="width=device-width" data-next-head=""><meta name="test-head-1" content="hello" data-next-head="">`
    )
  })

  it('should have correct head tags in initial document', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)

    for (let i = 1; i < 5; i++) {
      expect($(`meta[name="test-head-${i}"]`).attr()['content']).toBe('hello')
    }
  })

  it('should have correct head tags from a fragment', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)

    expect($(`meta[name="test-in-fragment"]`).attr()['content']).toBe('hello')
  })

  it('should have correct head tags after hydration', async () => {
    const browser = await next.browser('/')

    for (let i = 1; i < 5; i++) {
      expect(
        await browser
          .elementByCss(`meta[name="test-head-${i}"]`)
          .getAttribute('content')
      ).toBe('hello')
    }
  })

  it('should have current head tags from a _document getInitialProps', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)

    expect($(`meta[name="test-head-initial-props"]`).attr()['content']).toBe(
      'hello'
    )
  })
})

// @force-gate dev
describe('next/head dev route discovery', () => {
  const { next } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, 'app/pages')),
      components: new FileRef(join(__dirname, 'app/components')),
      'inject-readdir-delay.cjs': new FileRef(
        join(__dirname, 'app/inject-readdir-delay.cjs')
      ),
    },
    env: { NODE_OPTIONS: '--require ./inject-readdir-delay.cjs' },
    skipStart: true,
  })

  it('waits for the initial route scan before serving pages', async () => {
    let heldScan: ServerResponse | undefined
    const control = createServer((request, response) => {
      if (request.url === '/scan') {
        heldScan = response
        control.emit('scan-held')
      } else {
        control.emit('request-arrived')
        response.end()
      }
    })
    control.listen(0, '127.0.0.1')
    await once(control, 'listening')
    const address = control.address()
    if (!address || typeof address === 'string')
      throw new Error('No control listener')
    next.env.ROUTING_ROUTE_SCAN_CONTROL_ORIGIN = `http://127.0.0.1:${address.port}`
    const scanHeld = once(control, 'scan-held', {
      signal: AbortSignal.timeout(15000),
    })
    const startup = next.start()
    try {
      await scanHeld
      const arrived = once(control, 'request-arrived', {
        signal: AbortSignal.timeout(15000),
      })
      const response = next.fetch('/?__route_readiness=1', {
        signal: AbortSignal.timeout(20000),
      })
      await arrived
      // The preload fails the child if this request commits headers before
      // release. The request has arrived; no sleep estimates its timing.
      heldScan!.end('release')
      await startup
      const result = await response
      expect(result.status).toBe(200)
      expect(await result.text()).toContain('index page')
    } finally {
      heldScan?.end('release')
      await startup.catch(() => {})
      await new Promise<void>((resolve) => control.close(() => resolve()))
    }
  })
})
