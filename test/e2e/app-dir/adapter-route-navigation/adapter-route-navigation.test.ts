import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

const basePath = '/base'
const routePath = '/many/one/two/three/four/five/six/seven/eight'
const rootParameters = [
  { team: 'acme', region: 'east' },
  { team: 'cash$2', region: 'east' },
  { team: 'cash$3', region: 'east' },
  { team: 'sparse', region: 'west' },
]
const parameters = {
  first: 'one',
  second: 'two',
  third: 'three',
  fourth: 'four',
  fifth: 'five',
  sixth: 'six',
  seventh: 'seven',
  eighth: 'eight',
  ninth: 'nine',
}

describe.each([false, true])(
  'adapter route navigation, collapseAdapterRoutes: %s',
  (collapseAdapterRoutes) => {
    const { next } = nextTestSetup({
      files: __dirname,
      env: { TEST_COLLAPSE_ADAPTER_ROUTES: String(collapseAdapterRoutes) },
    })

    async function startBrowser(pathname: string) {
      let act: ReturnType<typeof createRouterAct> | undefined
      const browser = await next.browser(`${basePath}${pathname}`, {
        permissions: [],
        beforePageLoad(page) {
          act = createRouterAct(page, { includeAppShellRequests: true })
        },
      })
      if (act === undefined) {
        throw new Error('Router act was not initialized')
      }
      await browser.eval('window.__testDocument = "retained"')
      return { browser, act }
    }

    it.each(rootParameters)(
      'renders every parameter on a direct visit within $team/$region',
      async ({ team, region }) => {
        const { browser } = await startBrowser(
          `/${team}/${region}${routePath}/nine?term=kept`
        )
        expect(
          JSON.parse(await browser.elementById('parameters').text())
        ).toEqual({
          team: encodeURIComponent(team),
          region: encodeURIComponent(region),
          ...parameters,
        })
        expect(JSON.parse(await browser.elementById('query').text())).toEqual({
          term: 'kept',
        })
      }
    )

    it.each(rootParameters)(
      'navigates within $team/$region without prefetching',
      async ({ team, region }) => {
        const prefix = `/${team}/${region}`
        // App Router passes encoded parameter values to components.
        const expectedParameters = {
          team: encodeURIComponent(team),
          region: encodeURIComponent(region),
          ...parameters,
        }
        const { browser, act } = await startBrowser(`${prefix}/hub`)
        expect(await browser.elementById('root-params').text()).toBe(
          `${expectedParameters.team}:${expectedParameters.region}`
        )
        const href = `/${expectedParameters.team}/${expectedParameters.region}${routePath}/nine?term=kept`
        await act(
          async () => {
            await browser.elementByCss(`a[href="${basePath}${href}"]`).click()
          },
          { includes: 'Article nine' }
        )
        expect(
          JSON.parse(await browser.elementById('parameters').text())
        ).toEqual(expectedParameters)
        expect(JSON.parse(await browser.elementById('query').text())).toEqual({
          term: 'kept',
        })
        expect(decodeURIComponent(new URL(await browser.url()).pathname)).toBe(
          `${basePath}${prefix}${routePath}/nine`
        )
        expect(await browser.eval('window.__testDocument')).toBe('retained')
      }
    )

    // @force-gate prefetching
    it('prefetches page content before navigation', async () => {
      const { browser, act } = await startBrowser('/acme/east/hub')
      const href = `/acme/east${routePath}/prefetched?term=kept`
      await act(
        async () => {
          await browser
            .elementByCss(`input[data-link-accordion="${href}"]`)
            .click()
        },
        { includes: 'Many parameters' }
      )
      await act(
        async () => {
          await browser.elementByCss(`a[href="${basePath}${href}"]`).click()
        },
        { includes: 'Article prefetched' }
      )
      expect(
        JSON.parse(await browser.elementById('parameters').text())
      ).toEqual({
        team: 'acme',
        region: 'east',
        ...parameters,
        ninth: 'prefetched',
      })
      expect(JSON.parse(await browser.elementById('query').text())).toEqual({
        term: 'kept',
      })
      expect(await browser.eval('window.__testDocument')).toBe('retained')
    })

    it('returns 404 outside the base path', async () => {
      for (const invalidBasePath of ['/base-other', '/bas', '/baseX']) {
        const response = await next.fetch(`${invalidBasePath}/acme/east/hub`)
        expect(response.status).toBe(404)
      }
    })
  }
)
