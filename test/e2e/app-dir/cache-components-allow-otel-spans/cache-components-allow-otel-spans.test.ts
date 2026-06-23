import { isNextDev, nextTestSetup } from 'e2e-utils'

describe('cache-components OTEL spans', () => {
  const { next, isTurbopack, isNextDeploy } = nextTestSetup({
    files: __dirname,
    dependencies: require('./package.json').dependencies,
    // This test sometimes takes longer than the default timeout, extending it bit longer
    // to avoid flakiness.
    startServerTimeout: 15_000,
  })

  if (isNextDev) {
    it('should allow creating spans during cache component validation without triggering sync IO bailouts - inside a Cache Component - without prerendering the page', async () => {
      const browser = await next.browser('/novel/cache')
      if (isTurbopack) {
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "A Cache Function (\`use cache\`) was passed to startActiveSpan which means it will receive a Span argument with a possibly random ID on every invocation leading to cache misses. Provide a wrapping function around the Cache Function that does not forward the Span argument to avoid this issue.",
           "environmentLabel": "Cache",
           "label": "Console Error",
           "source": "app/traced-work.tsx (26:19) @ <anonymous>
         > 26 |     return tracer.startActiveSpan('span-active-span', fn)
              |                   ^",
           "stack": [
             "<anonymous> app/traced-work.tsx (26:19)",
             "Inner app/traced-work.tsx (97:26)",
             "Page <anonymous>",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "A Cache Function (\`use cache\`) was passed to startActiveSpan which means it will receive a Span argument with a possibly random ID on every invocation leading to cache misses. Provide a wrapping function around the Cache Function that does not forward the Span argument to avoid this issue.",
           "environmentLabel": "Cache",
           "label": "Console Error",
           "source": "app/traced-work.tsx (26:19) @ eval
         > 26 |     return tracer.startActiveSpan('span-active-span', fn)
              |                   ^",
           "stack": [
             "eval app/traced-work.tsx (26:19)",
             "Inner app/traced-work.tsx (97:26)",
             "Page <anonymous>",
           ],
         }
        `)
      }

      // Ideally we would assert the cached/loading status of each test case in dev but there are bugs with warmup renders that make this racey
      // For now we just assert that we actually get the non-zero span ids.
      const t7 = await browser.elementByCss('#t7 .span')
      expect(parseInt(await t7.textContent())).not.toEqual(0)

      const t8 = await browser.elementByCss('#t8 .span')
      expect(parseInt(await t8.textContent())).not.toEqual(0)

      console.log('t7', await t7.textContent())
      console.log('t8', await t8.textContent())
    })
    it('should allow creating spans during cache component validation without triggering sync IO bailouts - inside a Cache Component - with prerendering the page', async () => {
      // In dev there really isn't any prerendering but since this test case exists for prod testing I want to keep it exercised in the dev pathway too
      const browser = await next.browser('/prerendered/cache')
      if (isTurbopack) {
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "A Cache Function (\`use cache\`) was passed to startActiveSpan which means it will receive a Span argument with a possibly random ID on every invocation leading to cache misses. Provide a wrapping function around the Cache Function that does not forward the Span argument to avoid this issue.",
           "environmentLabel": "Cache",
           "label": "Console Error",
           "source": "app/traced-work.tsx (26:19) @ <anonymous>
         > 26 |     return tracer.startActiveSpan('span-active-span', fn)
              |                   ^",
           "stack": [
             "<anonymous> app/traced-work.tsx (26:19)",
             "Inner app/traced-work.tsx (97:26)",
             "Page <anonymous>",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "A Cache Function (\`use cache\`) was passed to startActiveSpan which means it will receive a Span argument with a possibly random ID on every invocation leading to cache misses. Provide a wrapping function around the Cache Function that does not forward the Span argument to avoid this issue.",
           "environmentLabel": "Cache",
           "label": "Console Error",
           "source": "app/traced-work.tsx (26:19) @ eval
         > 26 |     return tracer.startActiveSpan('span-active-span', fn)
              |                   ^",
           "stack": [
             "eval app/traced-work.tsx (26:19)",
             "Inner app/traced-work.tsx (97:26)",
             "Page <anonymous>",
           ],
         }
        `)
      }

      // Ideally we would assert the cached/loading status of each test case in dev but there are bugs with warmup renders that make this racey
      // For now we just assert that we actually get the non-zero span ids.
      const t7 = await browser.elementByCss('#t7 .span')
      expect(parseInt(await t7.textContent())).not.toEqual(0)

      const t8 = await browser.elementByCss('#t8 .span')
      expect(parseInt(await t8.textContent())).not.toEqual(0)

      console.log('t7', await t7.textContent())
      console.log('t8', await t8.textContent())
    })
    it('should allow creating spans during cache component validation without triggering sync IO bailouts - inside a Server Component - without prerendering the page', async () => {
      const browser = await next.browser('/novel/server')
      if (isTurbopack) {
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "A Cache Function (\`use cache\`) was passed to startActiveSpan which means it will receive a Span argument with a possibly random ID on every invocation leading to cache misses. Provide a wrapping function around the Cache Function that does not forward the Span argument to avoid this issue.",
           "environmentLabel": "Prefetchable",
           "label": "Console Error",
           "source": "app/traced-work.tsx (26:19) @ <anonymous>
         > 26 |     return tracer.startActiveSpan('span-active-span', fn)
              |                   ^",
           "stack": [
             "<anonymous> app/traced-work.tsx (26:19)",
             "Inner app/traced-work.tsx (97:26)",
             "CachedInnerTraceActiveSpan app/traced-work.tsx (104:9)",
             "Page app/[slug]/server/page.tsx (36:7)",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "A Cache Function (\`use cache\`) was passed to startActiveSpan which means it will receive a Span argument with a possibly random ID on every invocation leading to cache misses. Provide a wrapping function around the Cache Function that does not forward the Span argument to avoid this issue.",
           "environmentLabel": "Prefetchable",
           "label": "Console Error",
           "source": "app/traced-work.tsx (26:19) @ eval
         > 26 |     return tracer.startActiveSpan('span-active-span', fn)
              |                   ^",
           "stack": [
             "eval app/traced-work.tsx (26:19)",
             "Inner app/traced-work.tsx (97:26)",
             "CachedInnerTraceActiveSpan app/traced-work.tsx (104:9)",
             "Page app/[slug]/server/page.tsx (36:7)",
           ],
         }
        `)
      }

      // Ideally we would assert the cached/loading status of each test case in dev but there are bugs with warmup renders that make this racey
      // For now we just assert that we actually get the non-zero span ids.
      const t7 = await browser.elementByCss('#t7 .span')
      expect(parseInt(await t7.textContent())).not.toEqual(0)

      const t8 = await browser.elementByCss('#t8 .span')
      expect(parseInt(await t8.textContent())).not.toEqual(0)

      console.log('t7', await t7.textContent())
      console.log('t8', await t8.textContent())
    })
    it('should allow creating spans during cache component validation without triggering sync IO bailouts - inside a Server Component - with prerendering the page', async () => {
      // In dev there really isn't any prerendering but since this test case exists for prod testing I want to keep it exercised in the dev pathway too
      const browser = await next.browser('/prerendered/server')
      if (isTurbopack) {
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "A Cache Function (\`use cache\`) was passed to startActiveSpan which means it will receive a Span argument with a possibly random ID on every invocation leading to cache misses. Provide a wrapping function around the Cache Function that does not forward the Span argument to avoid this issue.",
           "environmentLabel": "Prerender",
           "label": "Console Error",
           "source": "app/traced-work.tsx (26:19) @ <anonymous>
         > 26 |     return tracer.startActiveSpan('span-active-span', fn)
              |                   ^",
           "stack": [
             "<anonymous> app/traced-work.tsx (26:19)",
             "Inner app/traced-work.tsx (97:26)",
             "CachedInnerTraceActiveSpan app/traced-work.tsx (104:9)",
             "Page app/[slug]/server/page.tsx (36:7)",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "code": "E394",
           "description": "A Cache Function (\`use cache\`) was passed to startActiveSpan which means it will receive a Span argument with a possibly random ID on every invocation leading to cache misses. Provide a wrapping function around the Cache Function that does not forward the Span argument to avoid this issue.",
           "environmentLabel": "Prerender",
           "label": "Console Error",
           "source": "app/traced-work.tsx (26:19) @ eval
         > 26 |     return tracer.startActiveSpan('span-active-span', fn)
              |                   ^",
           "stack": [
             "eval app/traced-work.tsx (26:19)",
             "Inner app/traced-work.tsx (97:26)",
             "CachedInnerTraceActiveSpan app/traced-work.tsx (104:9)",
             "Page app/[slug]/server/page.tsx (36:7)",
           ],
         }
        `)
      }

      // Ideally we would assert the cached/loading status of each test case in dev but there are bugs with warmup renders that make this racey
      // For now we just assert that we actually get the non-zero span ids.
      const t7 = await browser.elementByCss('#t7 .span')
      expect(parseInt(await t7.textContent())).not.toEqual(0)

      const t8 = await browser.elementByCss('#t8 .span')
      expect(parseInt(await t8.textContent())).not.toEqual(0)

      console.log('t7', await t7.textContent())
      console.log('t8', await t8.textContent())
    })
  } else {
    it('should allow creating Spans during prerendering during the build - inside a Cache Components', async () => {
      const browser = await next.browser('/prerendered/cache')
      {
        const t7 = await browser.elementByCss('#t7 .span')
        // the span was prerendered during the build
        expect(parseInt(await t7.textContent())).toEqual(0)
        const t8 = await browser.elementByCss('#t8 .span')
        // the span was prerendered during the build
        expect(parseInt(await t8.textContent())).toEqual(0)

        // load again
        await browser.loadPage(`${next.url}/prerendered/cache`)
        const t7again = await browser.elementByCss('#t7 .span')
        // the span was prerendered during the build
        expect(parseInt(await t7again.textContent())).toEqual(0)
        const t8again = await browser.elementByCss('#t8 .span')
        // the span was prerendered during the build
        expect(parseInt(await t8again.textContent())).toEqual(0)
      }

      {
        await browser.loadPage(`${next.url}/prerendered/server`)
        const t7 = await browser.elementByCss('#t7 .span')
        // the span was prerendered during the build
        expect(parseInt(await t7.textContent())).toEqual(0)
        const t8 = await browser.elementByCss('#t8 .span')
        // the span was prerendered during the build
        expect(parseInt(await t8.textContent())).toEqual(0)

        // load again
        await browser.loadPage(`${next.url}/prerendered/server`)
        const t7again = await browser.elementByCss('#t7 .span')
        // the span was prerendered during the build
        expect(parseInt(await t7again.textContent())).toEqual(0)
        const t8again = await browser.elementByCss('#t8 .span')
        // the span was prerendered during the build
        expect(parseInt(await t8again.textContent())).toEqual(0)
      }

      {
        await browser.loadPage(`${next.url}/prerendered/fallback`)
        const t7 = await browser.elementByCss('#t7 .span')
        // the span was prerendered during the build
        expect(parseInt(await t7.textContent())).toEqual(0)
        const t8 = await browser.elementByCss('#t8 .span')
        // the span was prerendered during the build
        expect(parseInt(await t8.textContent())).toEqual(0)

        // load again
        await browser.loadPage(`${next.url}/prerendered/fallback`)
        const t7again = await browser.elementByCss('#t7 .span')
        // the span was prerendered during the build
        expect(parseInt(await t7again.textContent())).toEqual(0)
        const t8again = await browser.elementByCss('#t8 .span')
        // the span was prerendered during the build
        expect(parseInt(await t8again.textContent())).toEqual(0)
      }
    })
    it('should allow creating Spans during prerendering at runtime - inside a Cache Components', async () => {
      const browser = await next.browser('/novel/cache')
      {
        const t7 = await browser.elementByCss('#t7 .span')
        const t7value = parseInt(await t7.textContent())
        // the span was prerendered at runtime
        expect(t7value).not.toEqual(0)

        const t8 = await browser.elementByCss('#t8 .span')
        const t8value = parseInt(await t8.textContent())
        // the span was prerendered at runtime
        expect(t8value).not.toEqual(0)

        // load again
        await browser.loadPage(`${next.url}/novel/cache`)
        const t7again = await browser.elementByCss('#t7 .span')
        const t7againValue = parseInt(await t7again.textContent())
        // this page was cached so the span should be cached too
        expect(t7againValue).toEqual(t7value)

        const t8again = await browser.elementByCss('#t8 .span')
        const t8againValue = parseInt(await t8again.textContent())
        // this page was cached so the span should be cached too
        expect(t8againValue).toEqual(t8value)
      }

      {
        await browser.loadPage(`${next.url}/novel/server`)
        const t7 = await browser.elementByCss('#t7 .span')
        const t7value = parseInt(await t7.textContent())
        // the span was prerendered at runtime
        expect(t7value).not.toEqual(0)
        const t8 = await browser.elementByCss('#t8 .span')
        const t8value = parseInt(await t8.textContent())
        // the span was prerendered at runtime
        expect(t8value).not.toEqual(0)

        // load again
        await browser.loadPage(`${next.url}/novel/server`)
        const t7again = await browser.elementByCss('#t7 .span')
        const t7againValue = parseInt(await t7again.textContent())
        const t8again = await browser.elementByCss('#t8 .span')
        const t8againValue = parseInt(await t8again.textContent())
        // this page was cached so the spans should be cached too
        // TODO: Normally we'd expect the first request to be a blocking
        // prerender for the unknown param, which means the served response is
        // the same response that's saved and served on subsequent requests.
        // However, this appeared to have regressed recently with `next start`,
        // so instead a dynamic SSR response is served on the first request, and
        // in the background the prerendered response is generated and saved for
        // subsequent requests. This means the first request's span values are
        // different from the second request's span values. When this regression
        // is fixed, the following assertions should be consolidated to just
        // assert that the second request's span values equal the first
        // request's span values. The failure is masked in CI because of the
        // built-in jest retry. On the retry attempt the requests use the
        // prerendered response from the first attempt, thus making the test
        // succeed. That retry behavior is disabled though when the test is run
        // in the flaky detection CI job, which is why it fails whenever it is
        // touched.
        if (isNextDeploy) {
          expect(t7againValue).toEqual(t7value)
          expect(t8againValue).toEqual(t8value)
        } else {
          expect(t7againValue).not.toEqual(t7value)
          expect(t8againValue).not.toEqual(t8value)
        }
      }
    })
    it('should allow creating Spans during resuming a fallback - inside a Cache Component', async () => {
      const browser = await next.browser('/novel/fallback')
      {
        const t7 = await browser.elementByCss('#t7 .span')
        const t7value = parseInt(await t7.textContent())
        // the span was prerendered at runtime
        expect(t7value).not.toEqual(0)
        const t8 = await browser.elementByCss('#t8 .span')
        const t8value = parseInt(await t8.textContent())
        // the span was prerendered at runtime
        expect(t8value).not.toEqual(0)

        // load again
        await browser.loadPage(`${next.url}/novel/fallback`)
        const t7again = await browser.elementByCss('#t7 .span')
        const t7againValue = parseInt(await t7again.textContent())
        // this page renders the spans in the resume on each request
        expect(t7againValue).not.toEqual(t7value)
        expect(t7againValue).not.toEqual(0)

        const t8again = await browser.elementByCss('#t8 .span')
        const t8againValue = parseInt(await t8again.textContent())
        // this page renders the spans in the resume on each request
        expect(t8againValue).not.toEqual(t8value)
        expect(t8againValue).not.toEqual(0)
      }
    })
  }
})
