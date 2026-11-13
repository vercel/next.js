import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { load } from 'cheerio'
import { createRouterAct } from 'router-act'
import type * as Playwright from 'playwright'

describe('cache-components-navigation-cache-miss', () => {
  const { next } = nextTestSetup({ files: __dirname })
  let playwrightBrowser: Playwright.Browser

  beforeAll(async () => {
    await next.browser('/?target=/items/static', {
      beforePageLoad(page: Playwright.Page) {
        playwrightBrowser = page.context().browser()!
      },
    })
  })

  async function client(pathname: string, testCase: string, caller = 'one') {
    const responses: Playwright.Response[] = []
    // Each caller needs its own cookies and router cache. The browser helper
    // shares a context and closes its previous page.
    const context = await playwrightBrowser.newContext()
    await context.addCookies([
      { name: 'caller', value: caller, url: next.url },
      { name: 'test-case', value: testCase, url: next.url },
    ])
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const act = createRouterAct(page)
    page.on('response', (response) => {
      if (
        new URL(response.url()).pathname === pathname &&
        response.request().headers().rsc === '1'
      ) {
        responses.push(response)
      }
    })
    await page.goto(next.url + '/?target=' + encodeURIComponent(pathname))
    await page.waitForFunction('window.__NEXT_HYDRATED')
    await page.evaluate('window.__beforeNavigation = true')
    return {
      caller,
      page,
      close: () => context.close(),
      responses,
      navigate: (responseText: string) =>
        act(
          async () => {
            await page.locator('#show-target').click()
            await page.locator('#target').click()
          },
          { includes: responseText }
        ),
    }
  }

  type Client = Awaited<ReturnType<typeof client>>

  function expectFlight(responses: Playwright.Response[], dynamic: boolean) {
    expect(responses.length).toBeGreaterThan(0)
    for (const response of responses) {
      expect(response.status()).toBe(200)
      expect(response.headers()['x-nextjs-postponed']).toBeUndefined()
      if (dynamic) {
        expect(response.headers()['cache-control']).toContain('no-store')
        expect(response.headers()['x-nextjs-prerender']).toBeUndefined()
      }
    }
  }

  function expectSucceeded(results: PromiseSettledResult<unknown>[]) {
    for (const result of results) {
      if (result.status === 'rejected') {
        throw result.reason
      }
    }
  }

  async function expectRequestSpecificFlight(current: Client) {
    expectFlight(current.responses, true)
    expect(await current.page.locator('#caller').innerText()).toBe(
      'Caller: ' + current.caller
    )
    expect(await current.page.evaluate('window.__beforeNavigation')).toBe(true)
  }

  it.each([
    {
      path: '/items/static',
      testCase: 'static',
      text: 'Item: static',
      html: 'complete',
    },
    {
      path: '/client-hole/known',
      testCase: 'client-hole',
      text: 'Client-hole page',
      html: 'initial',
    },
  ])(
    'coalesces blocking misses for complete RSC at $path',
    async ({ path, testCase, text, html }) => {
      const manifest = await next.readJSON('.next/prerender-manifest.json')
      expect(manifest.routes[path].response).toBe(html)
      expect(manifest.routes[path].prefetchDataRoute).toBeTruthy()
      await next.patchFile(testCase + '.hold', '')
      const first = await client(path, testCase, 'one')
      const second = await client(path, testCase, 'two')
      const navigations = Promise.allSettled([
        first.navigate(text),
        second.navigate(text),
      ])
      try {
        await retry(() => next.readFile(testCase + '.held'))
        await retry(() => next.readFile(testCase + '.requested-one'))
        await retry(() => next.readFile(testCase + '.requested-two'))
        expect(first.responses).toHaveLength(0)
        expect(second.responses).toHaveLength(0)
        await next.patchFile(testCase + '.release', '')
        expectSucceeded(await navigations)
        for (const current of [first, second]) {
          expectFlight(current.responses, false)
          expect(await current.page.evaluate('window.__beforeNavigation')).toBe(
            true
          )
        }
        const stored = await next.readJSON(testCase + '.stored.json')
        expect(stored).toEqual({ writes: 1, hasPostponed: false })
        const document = await next.fetch(path)
        expect(document.headers.get('x-nextjs-cache')).toBe('HIT')
        await document.text()
      } finally {
        await next.patchFile(testCase + '.release', '')
        await navigations
        await first.close()
        await second.close()
      }
    }
  )

  it('waits for a prerender for an unknown explicitly blocking value', async () => {
    const path = '/blocking/unbuilt'
    const manifest = await next.readJSON('.next/prerender-manifest.json')
    expect(manifest.routes[path]).toBeUndefined()
    expect(manifest.dynamicRoutes['/blocking/[slug]'].compute).toBe('blocking')
    expect(
      manifest.dynamicRoutes['/blocking/[slug]'].isExplicitlyBlocking
    ).toBe(true)
    await next.patchFile('unbuilt.cookies', '')
    await next.patchFile('unbuilt.hold', '')
    const current = await client(path, 'unbuilt')
    const navigation = Promise.allSettled([current.navigate('Caller: one')])
    try {
      await retry(() => next.readFile('unbuilt.held'))
      expect(current.responses).toHaveLength(0)
      await next.patchFile('unbuilt.release', '')
      expectSucceeded(await navigation)
      await expectRequestSpecificFlight(current)
      expect(await next.readJSON('unbuilt.stored.json')).toEqual({
        writes: 1,
        hasPostponed: true,
      })
    } finally {
      await next.patchFile('unbuilt.release', '')
      await navigation
      await current.close()
    }
  })

  it('waits for regeneration after an on-demand blocking prerender expires', async () => {
    const path = '/blocking/expiration'
    const manifest = await next.readJSON('.next/prerender-manifest.json')
    expect(manifest.routes[path]).toBeUndefined()
    expect(manifest.dynamicRoutes['/blocking/[slug]'].compute).toBe('blocking')
    await next.patchFile('expiration.cookies', '')
    const initial = await client(path, 'expiration', 'one')
    try {
      await initial.navigate('Caller: one')
      await expectRequestSpecificFlight(initial)
      expect(await next.readJSON('expiration.stored.json')).toEqual({
        writes: 1,
        hasPostponed: true,
      })
    } finally {
      await initial.close()
    }

    await next.patchFile('expiration.expired', '')
    await next.patchFile('expiration.hold', '')
    const current = await client(path, 'expiration', 'two')
    const navigation = Promise.allSettled([current.navigate('Caller: two')])
    try {
      await retry(() => next.readFile('expiration.held'))
      expect(await next.readFile('expiration.lookup-two')).toBe('expired')
      expect(current.responses).toHaveLength(0)
      await next.patchFile('expiration.release', '')
      expectSucceeded(await navigation)
      await expectRequestSpecificFlight(current)
      await expect(
        next.readFile('expiration.rendered-before-release')
      ).rejects.toThrow(/ENOENT/)
      expect(await next.readJSON('expiration.stored.json')).toEqual({
        writes: 2,
        hasPostponed: true,
      })
    } finally {
      await next.patchFile('expiration.release', '')
      await next.deleteFile('expiration.expired')
      await navigation
      await current.close()
    }
  })

  it('uses the concrete classification for a built partial path under a blocking matcher', async () => {
    const path = '/blocking/required'
    const manifest = await next.readJSON('.next/prerender-manifest.json')
    expect(manifest.routes[path]).toMatchObject({
      response: 'initial',
      compute: 'resuming',
    })
    expect(manifest.routes[path].prefetchDataRoute).toBeUndefined()
    expect(manifest.dynamicRoutes['/blocking/[slug]'].compute).toBe('blocking')
    await next.patchFile('required.hold', '')
    const current = await client(path, 'required')
    const navigation = Promise.allSettled([current.navigate('Caller: one')])
    try {
      await retry(() => next.readFile('required.held'))
      expectSucceeded(await navigation)
      await expectRequestSpecificFlight(current)
      await expect(next.readFile('required.stored.json')).rejects.toThrow(
        /ENOENT/
      )
    } finally {
      await next.patchFile('required.release', '')
      await navigation
      await current.close()
    }
    await retry(async () => {
      expect(await next.readJSON('required.stored.json')).toEqual({
        writes: 1,
        hasPostponed: true,
      })
    })
  })

  it('serves concurrent incomplete misses while one background prerender is held', async () => {
    const path = '/items/async'
    const manifest = await next.readJSON('.next/prerender-manifest.json')
    expect(manifest.routes[path].prefetchDataRoute).toBeUndefined()
    await next.patchFile('async.hold', '')
    const first = await client(path, 'async', 'one')
    const second = await client(path, 'async', 'two')
    const navigations = Promise.allSettled([
      first.navigate('Caller: one'),
      second.navigate('Caller: two'),
    ])
    try {
      await retry(() => next.readFile('async.held'))
      await retry(async () => {
        expect(first.responses.length).toBeGreaterThan(0)
        expect(second.responses.length).toBeGreaterThan(0)
      })
      expectSucceeded(await navigations)
      for (const current of [first, second]) {
        await expectRequestSpecificFlight(current)
      }
    } finally {
      await next.patchFile('async.release', '')
      await navigations
      await first.close()
      await second.close()
    }
    await retry(async () => {
      expect(await next.readJSON('async.stored.json')).toEqual({
        writes: 1,
        hasPostponed: true,
      })
    })
    const cached = await client(path, 'async', 'three')
    try {
      await cached.navigate('Caller: three')
      await expectRequestSpecificFlight(cached)
      expect((await next.readJSON('async.stored.json')).writes).toBe(1)
    } finally {
      await cached.close()
    }
  })

  it('renders request-specific Flight when a built static path becomes partial', async () => {
    const path = '/items/becomes-partial'
    const testCase = 'becomes-partial'
    const manifest = await next.readJSON('.next/prerender-manifest.json')
    expect(manifest.routes[path].prefetchDataRoute).toBeTruthy()
    await next.patchFile('becomes-partial.cookies', '')
    await next.patchFile('becomes-partial.hold', '')
    const first = await client(path, testCase, 'one')
    const second = await client(path, testCase, 'two')
    const firstNavigation = Promise.allSettled([first.navigate('Caller: one')])
    let secondNavigation: Promise<PromiseSettledResult<void>[]> | undefined
    try {
      await retry(() => next.readFile('becomes-partial.held'))
      secondNavigation = Promise.allSettled([second.navigate('Caller: two')])
      await retry(() => next.readFile('becomes-partial.requested-two'))
      expect(first.responses).toHaveLength(0)
      expect(second.responses).toHaveLength(0)
      await next.patchFile('becomes-partial.release', '')
      expectSucceeded(await firstNavigation)
      expectSucceeded(await secondNavigation)
      for (const current of [first, second]) {
        await expectRequestSpecificFlight(current)
      }
      await expect(next.readFile('becomes-partial.lookup-one')).resolves.toBe(
        'miss'
      )
      // The second caller must join the pending render. A later cache lookup
      // would not exercise the shared response cache result.
      await expect(next.readFile('becomes-partial.lookup-two')).rejects.toThrow(
        /ENOENT/
      )
      expect(await next.readJSON('becomes-partial.stored.json')).toEqual({
        writes: 1,
        hasPostponed: true,
      })
    } finally {
      await next.patchFile('becomes-partial.release', '')
      await firstNavigation
      await secondNavigation
      await first.close()
      await second.close()
    }
    const cached = await client(path, testCase, 'three')
    try {
      await cached.navigate('Caller: three')
      await expectRequestSpecificFlight(cached)
      await expect(next.readFile('becomes-partial.lookup-three')).resolves.toBe(
        'hit'
      )
      expect((await next.readJSON('becomes-partial.stored.json')).writes).toBe(
        1
      )
    } finally {
      await cached.close()
    }
  })

  it.each([
    {
      path: '/items/concurrent',
      testCase: 'concurrent',
      text: 'Item: concurrent',
      cookies: true,
    },
    {
      path: '/complete-shell/known',
      testCase: 'complete-shell',
      text: 'Complete generic shell',
      cookies: false,
    },
  ])(
    'renders Flight when joining a document fallback at $path',
    async ({ path, testCase, text, cookies }) => {
      if (cookies) {
        await next.patchFile(testCase + '.cookies', '')
      }
      const current = await client(path, testCase, 'navigation')
      const document = next.fetch(path, {
        headers: { 'x-hold-shell': testCase, cookie: 'caller=document' },
      })
      const documentSettled = Promise.allSettled([document])
      let navigation: Promise<PromiseSettledResult<void>[]> | undefined
      try {
        await retry(() => next.readFile(testCase + '.shell-held'))
        navigation = Promise.allSettled([current.navigate(text)])
        await retry(() => next.readFile(testCase + '.requested-navigation'))
        await next.patchFile(testCase + '.shell-release', '')
        expectSucceeded(await navigation)
        await expect(
          next.readFile(testCase + '.lookup-navigation')
        ).rejects.toThrow(/ENOENT/)
        expectFlight(current.responses, true)
        expect(await current.page.evaluate('window.__beforeNavigation')).toBe(
          true
        )
        const response = await document
        expect(response.status).toBe(200)
        const html = await response.text()
        if (cookies) {
          expect(await current.page.locator('#caller').innerText()).toBe(
            'Caller: navigation'
          )
          expect(load(html)('#caller').text()).toBe('Caller: document')
        } else {
          expect(await next.readJSON(testCase + '.shell.json')).toEqual({
            hasPostponed: false,
            hasRscData: true,
          })
          expect(html).toContain(text)
        }
      } finally {
        await next.patchFile(testCase + '.shell-release', '')
        await navigation
        await documentSettled
        await current.close()
      }
    }
  )

  it.each([
    {
      slug: 'not-found',
      marker: '.not-found',
      text: 'Item not found',
      responseText: 'Item not found',
      selector: 'not-found',
    },
    {
      slug: 'redirect',
      marker: '.redirect',
      text: 'Item: static',
      responseText: 'NEXT_REDIRECT;replace;/items/static;307;',
      selector: 'slug',
    },
  ])(
    'keeps a cold $slug prerender out of Flight status',
    async ({ slug, marker, text, responseText, selector }) => {
      await next.patchFile(slug + marker, '')
      const current = await client('/items/' + slug, slug)
      try {
        // The expectation matches this route's RSC response. React follows a
        // redirect from an effect, so the target request may start after the
        // scope ends.
        await current.navigate(responseText)
        expectFlight(current.responses, false)
        expect(await current.page.locator('#' + selector).innerText()).toBe(
          text
        )
        expect(await current.page.evaluate('window.__beforeNavigation')).toBe(
          true
        )
      } finally {
        await current.close()
      }
    }
  )
})
