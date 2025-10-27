import { nextTestSetup } from 'e2e-utils'

process.env.__TEST_SENTINEL = 'at buildtime'

describe('dynamic-data', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/main',
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should render the dynamic apis dynamically when used in a top-level scope', async () => {
    const $ = await next.render$(
      '/top-level?foo=foosearch',
      {},
      {
        headers: {
          fooheader: 'foo header value',
          cookie: 'foocookie=foo cookie value',
        },
      }
    )
    if (isNextDev) {
      // in dev we expect the entire page to be rendered at runtime
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else if (process.env.__NEXT_CACHE_COMPONENTS) {
      // in PPR we expect the shell to be rendered at build and the page to be rendered at runtime
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      // in static generation we expect the entire page to be rendered at runtime
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    }

    expect($('#headers .fooheader').text()).toBe('foo header value')
    expect($('#cookies .foocookie').text()).toBe('foo cookie value')
    expect($('#searchparams .foo').text()).toBe('foosearch')
  })

  it('should render the dynamic apis dynamically when used in a top-level scope with force dynamic', async () => {
    const $ = await next.render$(
      '/force-dynamic?foo=foosearch',
      {},
      {
        headers: {
          fooheader: 'foo header value',
          cookie: 'foocookie=foo cookie value',
        },
      }
    )
    if (isNextDev) {
      // in dev we expect the entire page to be rendered at runtime
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else if (process.env.__NEXT_CACHE_COMPONENTS) {
      // @TODO this should actually be build but there is a bug in how we do segment level dynamic in PPR at the moment
      // see note in create-component-tree
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      // in static generation we expect the entire page to be rendered at runtime
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    }

    expect($('#headers .fooheader').text()).toBe('foo header value')
    expect($('#cookies .foocookie').text()).toBe('foo cookie value')
    expect($('#searchparams .foo').text()).toBe('foosearch')
  })

  it('should render empty objects for dynamic APIs when rendering with force-static', async () => {
    const $ = await next.render$(
      '/force-static?foo=foosearch',
      {},
      {
        headers: {
          fooheader: 'foo header value',
          cookie: 'foocookie=foo cookie value',
        },
      }
    )
    if (isNextDev) {
      // in dev we expect the entire page to be rendered at runtime
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else if (process.env.__NEXT_CACHE_COMPONENTS) {
      // in PPR we expect the shell to be rendered at build and the page to be rendered at runtime
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      // we expect there to be a suspense boundary in fallback state
      expect($('#boundary').html()).toBeNull()
    } else {
      // in static generation we expect the entire page to be rendered at runtime
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      // we expect there to be no suspense boundary in fallback state
      expect($('#boundary').html()).toBeNull()
    }

    expect($('#headers .fooheader').html()).toBeNull()
    expect($('#cookies .foocookie').html()).toBeNull()
    expect($('#searchparams .foo').html()).toBeNull()
  })

  it('should track searchParams access as dynamic when the Page is a client component', async () => {
    const $ = await next.render$(
      '/client-page?foo=foosearch',
      {},
      {
        headers: {
          fooheader: 'foo header value',
          cookie: 'foocookie=foo cookie value',
        },
      }
    )
    if (isNextDev) {
      // in dev we expect the entire page to be rendered at runtime
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      // we don't assert the state of the fallback because it can depend on the timing
      // of when streaming starts and how fast the client references resolve
    } else if (process.env.__NEXT_CACHE_COMPONENTS) {
      // in PPR we expect the shell to be rendered at build and the page to be rendered at runtime
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at runtime')
      // we expect there to be a suspense boundary in fallback state
      expect($('#boundary').html()).not.toBeNull()
    } else {
      // in static generation we expect the entire page to be rendered at runtime
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      // we don't assert the state of the fallback because it can depend on the timing
      // of when streaming starts and how fast the client references resolve
    }

    expect($('#searchparams .foo').text()).toBe('foosearch')
  })

  if (!isNextDev) {
    it('should track dynamic apis when rendering app routes', async () => {
      expect(next.cliOutput).toContain(
        `Caught Error: Dynamic server usage: Route /routes/url couldn't be rendered statically because it used \`request.url\`.`
      )
      expect(next.cliOutput).toContain(
        `Caught Error: Dynamic server usage: Route /routes/next-url couldn't be rendered statically because it used \`nextUrl.toString\`.`
      )
    })
  }
})

describe('dynamic-data with dynamic = "error"', () => {
  const { next, isNextDev, isNextDeploy, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/require-static',
    skipStart: true,
  })

  if (skipped) {
    return
  }

  if (isNextDeploy) {
    it.skip('should not run in next deploy.', () => {})
    return
  }

  if (isNextDev) {
    beforeAll(async () => {
      await next.start()
    })

    it('displays redbox when `dynamic = "error"` and dynamic data is read in dev', async () => {
      let browser = await next.browser('/cookies?foo=foosearch')
      try {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Route /cookies with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies()\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering",
           "environmentLabel": "Server",
           "label": "Runtime Error",
           "source": "app/cookies/page.js (14:24) @ Page
         > 14 |         {(await cookies()).getAll().map((cookie) => {
              |                        ^",
           "stack": [
             "Page app/cookies/page.js (14:24)",
           ],
         }
        `)
      } finally {
        await browser.close()
      }

      browser = await next.browser('/connection')
      try {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Route /connection with \`dynamic = "error"\` couldn't be rendered statically because it used \`connection()\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering",
           "environmentLabel": "Server",
           "label": "Runtime Error",
           "source": "app/connection/page.js (6:19) @ Page
         > 6 |   await connection()
             |                   ^",
           "stack": [
             "Page app/connection/page.js (6:19)",
           ],
         }
        `)
      } finally {
        await browser.close()
      }

      browser = await next.browser('/headers?foo=foosearch')
      try {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Route /headers with \`dynamic = "error"\` couldn't be rendered statically because it used \`headers()\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering",
           "environmentLabel": "Server",
           "label": "Runtime Error",
           "source": "app/headers/page.js (14:35) @ Page
         > 14 |         {Array.from((await headers()).entries()).map(([key, value]) => {
              |                                   ^",
           "stack": [
             "Page app/headers/page.js (14:35)",
           ],
         }
        `)
      } finally {
        await browser.close()
      }

      browser = await next.browser('/search?foo=foosearch')
      try {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Route /search with \`dynamic = "error"\` couldn't be rendered statically because it used \`searchParams.then\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering",
           "environmentLabel": "Server",
           "label": "Runtime Error",
           "source": "app/search/page.js (12:31) @ Page
         > 12 |         {Object.entries(await searchParams).map(([key, value]) => {
              |                               ^",
           "stack": [
             "Page app/search/page.js (12:31)",
           ],
         }
        `)
      } finally {
        await browser.close()
      }
    })
  } else {
    it('error when the build when `dynamic = "error"` and dynamic data is read', async () => {
      try {
        await next.start()
      } catch (err) {
        // We expect this to fail
      }
      // Error: Page with `dynamic = "error"` couldn't be rendered statically because it used `headers`
      expect(next.cliOutput).toMatch(
        'Error: Route /cookies with `dynamic = "error"` couldn\'t be rendered statically because it used `cookies()`'
      )
      expect(next.cliOutput).toMatch(
        'Error: Route /connection with `dynamic = "error"` couldn\'t be rendered statically because it used `connection()`'
      )
      expect(next.cliOutput).toMatch(
        'Error: Route /headers with `dynamic = "error"` couldn\'t be rendered statically because it used `headers()`'
      )
      expect(next.cliOutput).toMatch(
        'Error: Route /search with `dynamic = "error"` couldn\'t be rendered statically because it used `await searchParams`, `searchParams.then`, or similar'
      )
      expect(next.cliOutput).toMatch(
        'Error: Route /routes/form-data/error with `dynamic = "error"` couldn\'t be rendered statically because it used `request.formData`'
      )
      expect(next.cliOutput).toMatch(
        'Error: Route /routes/next-url/error with `dynamic = "error"` couldn\'t be rendered statically because it used `nextUrl.toString`'
      )
    })
  }
})

describe('dynamic-data inside cache scope', () => {
  const { isTurbopack, next, isNextDev, isNextDeploy, skipped } = nextTestSetup(
    {
      files: __dirname + '/fixtures/cache-scoped',
      skipStart: true,
    }
  )

  if (skipped) {
    return
  }

  if (isNextDeploy) {
    it.skip('should not run in next deploy..', () => {})
    return
  }

  if (isNextDev) {
    beforeAll(async () => {
      await next.start()
    })

    it('displays redbox when accessing dynamic data inside a cache scope', async () => {
      let browser = await next.browser('/cookies')
      try {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Route /cookies used \`cookies()\` inside a function cached with \`unstable_cache()\`. Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache",
           "environmentLabel": "Server",
           "label": "Runtime Error",
           "source": "app/cookies/page.js (4:40) @ ${isTurbopack ? '<anonymous>' : 'eval'}
         > 4 | const cookies = cache(() => nextCookies())
             |                                        ^",
           "stack": [
             "${isTurbopack ? '<anonymous>' : 'eval'} app/cookies/page.js (4:40)",
             "Page app/cookies/page.js (15:11)",
           ],
         }
        `)
      } finally {
        await browser.close()
      }

      browser = await next.browser('/connection')
      try {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Route /connection used \`connection()\` inside a function cached with \`unstable_cache()\`. The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual Request, but caches must be able to be produced before a Request so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache",
           "environmentLabel": "Server",
           "label": "Runtime Error",
           "source": "app/connection/page.js (4:54) @ ${isTurbopack ? '<anonymous>' : 'eval'}
         > 4 | const cachedConnection = cache(async () => connection())
             |                                                      ^",
           "stack": [
             "${isTurbopack ? '<anonymous>' : 'eval'} app/connection/page.js (4:54)",
             "Page app/connection/page.js (7:3)",
           ],
         }
        `)
      } finally {
        await browser.close()
      }

      browser = await next.browser('/headers')
      try {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Route /headers used \`headers()\` inside a function cached with \`unstable_cache()\`. Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache",
           "environmentLabel": "Server",
           "label": "Runtime Error",
           "source": "app/headers/page.js (4:40) @ ${isTurbopack ? '<anonymous>' : 'eval'}
         > 4 | const headers = cache(() => nextHeaders())
             |                                        ^",
           "stack": [
             "${isTurbopack ? '<anonymous>' : 'eval'} app/headers/page.js (4:40)",
             "Page app/headers/page.js (15:21)",
           ],
         }
        `)
      } finally {
        await browser.close()
      }
    })
  } else {
    it('error when the build when accessing dynamic data inside a cache scope', async () => {
      try {
        await next.start()
      } catch (err) {
        // We expect this to fail
      }
      expect(next.cliOutput).toMatch(
        'Error: Route /cookies used `cookies()` inside a function cached with `unstable_cache()`.'
      )
      expect(next.cliOutput).toMatch(
        'Error: Route /connection used `connection()` inside a function cached with `unstable_cache()`.'
      )
      expect(next.cliOutput).toMatch(
        'Error: Route /headers used `headers()` inside a function cached with `unstable_cache()`.'
      )
    })
  }
})
