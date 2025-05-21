/* eslint-env jest */

import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import path from 'path'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18

describe('Client Navigation rendering <Head />', () => {
  describe.each([[false], [true]])(
    'with strictNextHead=%s',
    (strictNextHead) => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'fixture'),
        env: {
          TEST_STRICT_NEXT_HEAD: String(strictNextHead),
        },
      })

      function render(
        pathname: Parameters<typeof renderViaHTTP>[1],
        query?: Parameters<typeof renderViaHTTP>[2]
      ) {
        return renderViaHTTP(next.appPort, pathname, query)
      }

      it('should handle undefined prop in head server-side', async () => {
        const html = await render('/head')
        const $ = cheerio.load(html)
        const value = 'content' in $('meta[name="empty-content"]').attr()

        expect(value).toBe(false)
      })

      // default-head contains an empty <Head />.
      test('header renders default charset', async () => {
        const html = await render('/default-head')
        expect(html).toContain(
          strictNextHead
            ? '<meta charSet="utf-8" data-next-head=""/>'
            : '<meta charSet="utf-8"/>'
        )
        expect(html).toContain('next-head, but only once.')
      })

      test('header renders default viewport', async () => {
        const html = await render('/default-head')
        expect(html).toContain(
          strictNextHead
            ? '<meta name="viewport" content="width=device-width" data-next-head=""/>'
            : '<meta name="viewport" content="width=device-width"/>'
        )
      })

      test('header helper renders header information', async () => {
        const html = await render('/head')
        expect(html).toContain(
          strictNextHead
            ? '<meta charSet="iso-8859-5" data-next-head=""/>'
            : '<meta charSet="iso-8859-5"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta content="my meta" data-next-head=""/>'
            : '<meta content="my meta"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta name="viewport" content="width=device-width,initial-scale=1" data-next-head=""/>'
            : '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
        )
        expect(html).toContain('I can have meta tags')
      })

      test('header helper dedupes tags', async () => {
        const html = await render('/head')
        expect(html).toContain(
          strictNextHead
            ? '<meta charSet="iso-8859-5" data-next-head=""/>'
            : '<meta charSet="iso-8859-5"/>'
        )
        expect(html).not.toContain(
          strictNextHead
            ? '<meta charSet="utf-8" data-next-head=""/>'
            : '<meta charSet="utf-8"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta name="viewport" content="width=device-width,initial-scale=1" data-next-head=""/>'
            : '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
        )
        // Should contain only one viewport
        expect(html.match(/<meta name="viewport" /g).length).toBe(1)
        expect(html).not.toContain(
          '<meta name="viewport" content="width=device-width"'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta content="my meta" data-next-head=""/>'
            : '<meta content="my meta"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<link rel="stylesheet" href="/dup-style.css" data-next-head=""/><link rel="stylesheet" href="/dup-style.css" data-next-head=""/>'
            : '<link rel="stylesheet" href="/dup-style.css"/><link rel="stylesheet" href="/dup-style.css"/>'
        )
        const dedupeLink = strictNextHead
          ? '<link rel="stylesheet" href="dedupe-style.css" data-next-head=""/>'
          : '<link rel="stylesheet" href="dedupe-style.css"/>'
        expect(html).toContain(dedupeLink)
        expect(
          html.substring(html.indexOf(dedupeLink) + dedupeLink.length)
        ).not.toContain('<link rel="stylesheet" href="dedupe-style.css"')
        expect(html).toContain(
          strictNextHead
            ? '<link rel="alternate" hrefLang="en" href="/last/en" data-next-head=""/>'
            : '<link rel="alternate" hrefLang="en" href="/last/en"/>'
        )
        expect(html).not.toContain(
          '<link rel="alternate" hrefLang="en" href="/first/en"'
        )
      })

      test('header helper dedupes tags with the same key as the default', async () => {
        const html = await render('/head-duplicate-default-keys')
        // Expect exactly one `charSet`
        expect((html.match(/charSet=/g) || []).length).toBe(1)
        // Expect exactly one `viewport`
        expect((html.match(/name="viewport"/g) || []).length).toBe(1)
        expect(html).toContain(
          strictNextHead
            ? '<meta charSet="iso-8859-1" data-next-head=""/>'
            : '<meta charSet="iso-8859-1"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta name="viewport" content="width=500" data-next-head=""/>'
            : '<meta name="viewport" content="width=500"/>'
        )
      })

      test('header helper avoids dedupe of specific tags', async () => {
        const html = await render('/head')
        console.log(html)
        expect(html).toContain(
          strictNextHead
            ? '<meta property="article:tag" content="tag1" data-next-head=""/>'
            : '<meta property="article:tag" content="tag1"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="article:tag" content="tag2" data-next-head=""/>'
            : '<meta property="article:tag" content="tag2"/>'
        )
        expect(html).not.toContain('<meta property="dedupe:tag" content="tag3"')
        expect(html).toContain(
          strictNextHead
            ? '<meta property="dedupe:tag" content="tag4" data-next-head=""/>'
            : '<meta property="dedupe:tag" content="tag4"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image" content="ogImageTag1" data-next-head=""/>'
            : '<meta property="og:image" content="ogImageTag1"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image" content="ogImageTag2" data-next-head=""/>'
            : '<meta property="og:image" content="ogImageTag2"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image:alt" content="ogImageAltTag1" data-next-head=""/>'
            : '<meta property="og:image:alt" content="ogImageAltTag1"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image:alt" content="ogImageAltTag2" data-next-head=""/>'
            : '<meta property="og:image:alt" content="ogImageAltTag2"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image:width" content="ogImageWidthTag1" data-next-head=""/>'
            : '<meta property="og:image:width" content="ogImageWidthTag1"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image:width" content="ogImageWidthTag2" data-next-head=""/>'
            : '<meta property="og:image:width" content="ogImageWidthTag2"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image:height" content="ogImageHeightTag1" data-next-head=""/>'
            : '<meta property="og:image:height" content="ogImageHeightTag1"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image:height" content="ogImageHeightTag2" data-next-head=""/>'
            : '<meta property="og:image:height" content="ogImageHeightTag2"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image:type" content="ogImageTypeTag1" data-next-head=""/>'
            : '<meta property="og:image:type" content="ogImageTypeTag1"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image:type" content="ogImageTypeTag2" data-next-head=""/>'
            : '<meta property="og:image:type" content="ogImageTypeTag2"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image:secure_url" content="ogImageSecureUrlTag1" data-next-head=""/>'
            : '<meta property="og:image:secure_url" content="ogImageSecureUrlTag1"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image:secure_url" content="ogImageSecureUrlTag2" data-next-head=""/>'
            : '<meta property="og:image:secure_url" content="ogImageSecureUrlTag2"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image:url" content="ogImageUrlTag1" data-next-head=""/>'
            : '<meta property="og:image:url" content="ogImageUrlTag1"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="og:image:url" content="ogImageUrlTag2" data-next-head=""/>'
            : '<meta property="og:image:url" content="ogImageUrlTag2"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="fb:pages" content="fbpages1" data-next-head=""/>'
            : '<meta property="fb:pages" content="fbpages1"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta property="fb:pages" content="fbpages2" data-next-head=""/>'
            : '<meta property="fb:pages" content="fbpages2"/>'
        )
      })

      test('header helper avoids dedupe of meta tags with the same name if they use unique keys', async () => {
        const html = await render('/head')
        expect(html).toContain(
          strictNextHead
            ? '<meta name="citation_author" content="authorName1" data-next-head=""/>'
            : '<meta name="citation_author" content="authorName1"/>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta name="citation_author" content="authorName2" data-next-head=""/>'
            : '<meta name="citation_author" content="authorName2"/>'
        )
      })

      test('header helper renders Fragment children', async () => {
        const html = await render('/head')
        expect(html).toContain(
          strictNextHead
            ? '<title data-next-head="">Fragment title</title>'
            : '<title>Fragment title</title>'
        )
        expect(html).toContain(
          strictNextHead
            ? '<meta content="meta fragment" data-next-head=""/>'
            : '<meta content="meta fragment"/>'
        )
      })

      test('header helper renders boolean attributes correctly children', async () => {
        const html = await render('/head')
        expect(html).toContain(
          strictNextHead
            ? '<script src="/test-async-false.js" data-next-head="">'
            : '<script src="/test-async-false.js">'
        )
        expect(html).toContain(
          strictNextHead
            ? '<script src="/test-async-true.js" async="" data-next-head="">'
            : ''
        )
        expect(html).toContain(
          strictNextHead
            ? '<script src="/test-defer.js" defer="" data-next-head="">'
            : ''
        )
      })

      it('should place charset element at the top of <head>', async () => {
        const html = await render('/head-priority')
        const nextHeadElement = strictNextHead
          ? '<meta charSet="iso-8859-5" data-next-head=""/><meta name="viewport" content="width=device-width,initial-scale=1" data-next-head=""/><meta name="title" content="head title" data-next-head=""/>'
          : '<meta charSet="iso-8859-5"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="title" content="head title"/><meta name="next-head-count" content="3"/>'
        const documentHeadElement =
          '<meta name="keywords" content="document head test"/>'

        expect(html).toContain(
          isReact18
            ? // charset is not actually at the top.
              // data-next-hide-fouc comes first
              `</style></noscript>${nextHeadElement}${documentHeadElement}`
            : `<head>${nextHeadElement}${documentHeadElement}`
        )
      })
    }
  )
})
