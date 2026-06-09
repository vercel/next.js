import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'

/**
 * Regression test for https://github.com/vercel/next.js/issues/86048
 *
 * When the Pages Router `i18n` config uses domain-based routing, App Router
 * routes that rely on a dynamic `[lang]` segment must still resolve. The
 * Pages Router locale-prefix stripping previously clobbered App Router routes
 * whose first path segment is the locale, making them 404.
 */
describe('i18n-app-pages-domain', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const fetch = (path: string, host: string) =>
    fetchViaHTTP(next.appPort, path, undefined, { headers: { host } })

  describe('Pages Router', () => {
    it('serves the Pages Router home for the English domain', async () => {
      const res = await fetch('/', 'en.example.local')
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('#pages-home').text()).toBe('Pages Router Home')
      expect($('#pages-locale').text()).toBe('en-US')
      expect($('#pages-message').text()).toBe('Welcome to the homepage')
    })

    it('serves the Pages Router home for the Dutch domain', async () => {
      const res = await fetch('/', 'nl.example.local')
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('#pages-home').text()).toBe('Pages Router Home')
      expect($('#pages-locale').text()).toBe('nl-NL')
      expect($('#pages-message').text()).toBe('Welkom op de homepagina')
    })
  })

  describe('App Router via proxy rewrite', () => {
    it('serves the App Router /test page for the English domain', async () => {
      const res = await fetch('/test', 'en.example.local')
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('#test-page').text()).toBe('App Router Test Page')
      expect($('#test-locale').text()).toBe('en-US')
      expect($('#test-message').text()).toBe('This is the English version')
    })

    it('serves the App Router /test page for the Dutch domain', async () => {
      const res = await fetch('/test', 'nl.example.local')
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('#test-page').text()).toBe('App Router Test Page')
      expect($('#test-locale').text()).toBe('nl-NL')
      expect($('#test-message').text()).toBe('Dit is de Nederlandse versie')
    })
  })

  describe('App Router via direct locale-prefixed URL', () => {
    it('serves /en-US/test directly', async () => {
      const res = await fetch('/en-US/test', 'en.example.local')
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('#test-page').text()).toBe('App Router Test Page')
      expect($('#test-locale').text()).toBe('en-US')
    })

    it('serves /nl-NL/test directly', async () => {
      const res = await fetch('/nl-NL/test', 'nl.example.local')
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('#test-page').text()).toBe('App Router Test Page')
      expect($('#test-locale').text()).toBe('nl-NL')
    })

    it('serves a nested route with multiple dynamic segments', async () => {
      const res = await fetch('/nl-NL/blog/my-post', 'nl.example.local')
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('#blog-page').text()).toBe('App Router Blog Post')
      expect($('#blog-locale').text()).toBe('nl-NL')
      expect($('#blog-slug').text()).toBe('my-post')
    })
  })
})
