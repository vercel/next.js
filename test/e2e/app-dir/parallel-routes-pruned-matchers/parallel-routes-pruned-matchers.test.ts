import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import cheerio from 'cheerio'
import stripAnsi from 'strip-ansi'

const prunedRoutes: Array<[path: string, layoutId: string]> = [
  ['/named-catchall/anything', 'named-catchall-layout'],
  ['/children-catchall/foo', 'children-catchall-layout'],
  ['/children-catchall/bar', 'children-catchall-layout'],
  ['/optional-children-catchall', 'optional-children-catchall-layout'],
  ['/optional-children-catchall/anything', 'optional-children-catchall-layout'],
  ['/split-matcher/anything', 'split-matcher-layout'],
  ['/nested-parallel/anything', 'nested-parallel-layout'],
  ['/grouped/anything', 'grouped-layout'],
]

function getAppRoutes(cliOutput: string): string[] {
  const routes: string[] = []
  let inAppRoutes = false

  for (const line of stripAnsi(cliOutput).split('\n')) {
    if (line.startsWith('Route (app)')) {
      inAppRoutes = true
      continue
    }
    if (!inAppRoutes) continue

    const match = line.match(/^[┌├└] +(?:\S+ +)?(\/\S+)/)
    if (match) routes.push(match[1])
    if (line.startsWith('└')) break
  }

  return routes
}

describe('parallel-routes-pruned-matchers', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it.each(prunedRoutes)(
    'omits the permanently-not-found matcher for %s',
    async (path, layoutId) => {
      const response = await next.fetch(path)
      const $ = cheerio.load(await response.text())

      expect(response.status).toBe(404)
      expect($.root().text()).toContain('root not found')
      expect($(`#${layoutId}`).length).toBe(0)
    }
  )

  it.each(prunedRoutes)(
    'renders the same 404 after client navigation to %s',
    async (path, layoutId) => {
      let act: ReturnType<typeof createRouterAct>
      const responseStatuses: number[] = []
      const browser = await next.browser('/', {
        beforePageLoad(page) {
          page.on('response', (response) => {
            if (new URL(response.url()).pathname === path) {
              responseStatuses.push(response.status())
            }
          })
          act = createRouterAct(page, { allowErrorStatusCodes: [404] })
        },
      })

      await act!(async () => {
        await browser.elementByCss(`button[data-router-push="${path}"]`).click()
      })

      await browser.waitForElementByCss('#root-not-found')
      expect(await browser.elementById('root-not-found').text()).toBe(
        'root not found'
      )
      expect(await browser.hasElementByCss(`#${layoutId}`)).toBe(false)
      expect(responseStatuses).toContain(404)
    }
  )

  it('keeps a named-only matcher when every declared slot matches', async () => {
    const $ = await next.render$('/named-catchall/foo')

    expect($('#named-catchall-page').text()).toBe('named catch-all')
    expect($('#named-specific-page').text()).toBe('named specific page')
  })

  it('keeps a broad matcher composed entirely from named slots', async () => {
    const browser = await next.browser('/named-only-catchalls/anything')

    expect(await browser.elementById('named-only-left-catchall').text()).toBe(
      'left catch-all'
    )
    expect(await browser.elementById('named-only-right-catchall').text()).toBe(
      'right catch-all'
    )
  })

  it('renders a route with only named slots after client navigation', async () => {
    let act: ReturnType<typeof createRouterAct>
    const path = '/named-only-catchalls/anything'
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    await act!(async () => {
      await browser.elementByCss(`button[data-router-push="${path}"]`).click()
    })

    await browser.waitForElementByCss('#named-only-catchalls-layout')
    expect(await browser.elementById('named-only-left-catchall').text()).toBe(
      'left catch-all'
    )
    expect(await browser.elementById('named-only-right-catchall').text()).toBe(
      'right catch-all'
    )
  })

  it('keeps a named catch-all when children has an explicit default', async () => {
    const $ = await next.render$('/children-default/anything')

    expect($('#children-default').text()).toBe('children default')
    expect($('#children-default-slot-catchall').text()).toBe('slot catch-all')
  })

  it('keeps a catch-all matcher when every slot has catch-all coverage', async () => {
    const $ = await next.render$('/complete-catchalls/anything')

    expect($('#complete-children-catchall').text()).toBe('children catch-all')
    expect($('#complete-slot-catchall').text()).toBe('slot catch-all')
  })

  it('keeps a catch-all matcher when the sibling slot has a default', async () => {
    const $ = await next.render$('/valid/foo')

    expect($('#valid-catchall-page').text()).toBe('valid catch-all')
    expect($('#valid-slot-default').text()).toBe('valid slot default')
  })

  it('keeps a catch-all matcher when every sibling slot matches', async () => {
    const $ = await next.render$('/valid/special')

    expect($('#valid-catchall-page').text()).toBe('valid catch-all')
    expect($('#valid-slot-page').text()).toBe('valid slot page')
  })

  it('keeps the specific sibling of a pruned optional catch-all', async () => {
    const $ = await next.render$('/optional-children-catchall/specific')

    expect($('#optional-specific-page').text()).toBe('optional specific page')
    expect($('#optional-slot-page').text()).toBe('optional slot page')
  })

  it.each(['foo', 'bar'])(
    'keeps /split-matcher/%s while pruning the broader matcher',
    async (segment) => {
      const $ = await next.render$(`/split-matcher/${segment}`)

      expect($(`#split-${segment}-page`).text()).toBe(`${segment} page`)
      expect($('#split-slot-catchall').text()).toBe('split slot catch-all')
    }
  )

  it('keeps a matcher when an explicit default calls notFound', async () => {
    const response = await next.fetch('/default-not-found/anything')

    expect(response.status).toBe(404)
  })

  it('prunes a matcher with an incomplete nested parallel route', async () => {
    const $ = await next.render$('/nested-parallel/specific')

    expect($('#nested-specific-page').text()).toBe('nested specific page')
    expect($('#nested-outer-specific-page').text()).toBe(
      'nested outer specific page'
    )
    expect($('#nested-inner-specific-page').text()).toBe(
      'nested inner specific page'
    )
  })

  it('keeps the specific sibling of a pruned route-group matcher', async () => {
    const $ = await next.render$('/grouped/specific')

    expect($('#grouped-specific-page').text()).toBe('grouped specific page')
    expect($('#grouped-slot-page').text()).toBe('grouped slot page')
  })

  if (isNextStart) {
    it('lists only retained routes in the build output', () => {
      const appRoutes = getAppRoutes(next.cliOutput)
      const omittedRoutes = [
        '/named-catchall/[...slug]',
        '/children-catchall/[...slug]',
        '/optional-children-catchall/[[...slug]]',
        '/split-matcher/[...parts]',
        '/nested-parallel/[...slug]',
        '/grouped/[...slug]',
      ]

      expect(
        appRoutes.filter((route) => omittedRoutes.includes(route))
      ).toEqual([])
      expect(appRoutes).toEqual(
        expect.arrayContaining([
          '/named-catchall/foo',
          '/named-only-catchalls/[...slug]',
          '/children-default/[...slug]',
          '/complete-catchalls/[...slug]',
          '/valid/[...slug]',
          '/valid/special',
          '/optional-children-catchall/specific',
          '/split-matcher/foo',
          '/split-matcher/bar',
          '/default-not-found/[...slug]',
          '/nested-parallel/specific',
          '/grouped/specific',
        ])
      )
    })
  }
})
