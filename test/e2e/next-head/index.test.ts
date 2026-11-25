import { FileRef, nextTestSetup, isNextDev } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'
import { join } from 'path'

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

describe('next/head dev route discovery', () => {
  if (!isNextDev) {
    return
  }

  const { next } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, 'app/pages')),
      components: new FileRef(join(__dirname, 'app/components')),
      'inject-readdir-delay.cjs': new FileRef(
        join(__dirname, 'app/inject-readdir-delay.cjs')
      ),
    },
    env: { NODE_OPTIONS: '--require ./inject-readdir-delay.cjs' },
  })

  it('waits for the initial route scan before serving pages', async () => {
    const response = await next.fetch('/')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('index page')
    expect(next.cliOutput).toContain(
      '[next-head] delaying initial Watchpack pages scan'
    )
  })
})

describe('next/head dev route discovery after Watchpack EPERM', () => {
  if (!(global as any).isNextDev) {
    return
  }

  const { next } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, 'app/pages')),
      'inject-readdir-eperm.cjs': new FileRef(
        join(__dirname, 'app/inject-readdir-eperm.cjs')
      ),
    },
    env: { NODE_OPTIONS: '--require ./inject-readdir-eperm.cjs' },
  })

  it('serves routes from a directory whose initial scan failed', async () => {
    for (const [pathname, body] of [
      ['/a', 'nested page'],
      ['/a/b', 'deeply nested page'],
    ]) {
      const response = await next.fetch(pathname)

      expect(response.status).toBe(200)
      expect(await response.text()).toContain(body)
    }
    expect(next.cliOutput).toContain(
      '[next-head] failing initial Watchpack pages/a scan'
    )
  })
})
