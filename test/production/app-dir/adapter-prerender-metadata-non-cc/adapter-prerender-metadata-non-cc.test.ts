import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

type AdapterBuildContext = Parameters<NextAdapter['onBuildComplete']>[0]

type Classification = {
  routeType: 'route' | 'page' | 'fallback'
  response: 'complete' | 'initial' | 'empty'
  compute: 'static' | 'blocking'
}

const classificationKey = ({ routeType, response, compute }: Classification) =>
  `${routeType}/${response}/${compute}`

// Cache Components CI enables the feature for every fixture through this
// environment variable, which would change the expected non-CC taxonomy.
// Skip the whole suite so nextTestSetup does not start a build in that job.
;(process.env.__NEXT_CACHE_COMPONENTS === 'true' ? describe.skip : describe)(
  'adapter-prerender-metadata-non-cc',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    async function getPrerenders() {
      const { outputs }: AdapterBuildContext = await next.readJSON(
        'build-complete.json'
      )
      return outputs.prerenders
    }

    it('exercises every valid non-Cache-Components combination', async () => {
      const cases: Array<
        Classification & {
          pathname: string
          manifestSection: 'routes' | 'dynamicRoutes'
        }
      > = [
        {
          pathname: '/static-route',
          manifestSection: 'routes',
          routeType: 'route',
          response: 'complete',
          compute: 'static',
        },
        {
          pathname: '/',
          manifestSection: 'routes',
          routeType: 'page',
          response: 'complete',
          compute: 'static',
        },
        {
          pathname: '/gsp',
          manifestSection: 'routes',
          routeType: 'page',
          response: 'complete',
          compute: 'static',
        },
        {
          pathname: '/products/[slug]',
          manifestSection: 'dynamicRoutes',
          routeType: 'page',
          response: 'empty',
          compute: 'blocking',
        },
        {
          pathname: '/blocking/[id]',
          manifestSection: 'dynamicRoutes',
          routeType: 'page',
          response: 'empty',
          compute: 'blocking',
        },
        {
          pathname: '/static-fallback/[id]',
          manifestSection: 'dynamicRoutes',
          routeType: 'fallback',
          response: 'initial',
          compute: 'static',
        },
      ]

      const expectedKeys = [
        'route/complete/static',
        'page/complete/static',
        'page/empty/blocking',
        'fallback/initial/static',
      ]
      expect(Array.from(new Set(cases.map(classificationKey))).sort()).toEqual(
        expectedKeys.sort()
      )

      const prerenders = await getPrerenders()
      const manifest = await next.readJSON('.next/prerender-manifest.json')
      for (const { pathname, manifestSection, ...classification } of cases) {
        const output = prerenders.find(
          (prerender) => prerender.pathname === pathname
        )
        expect(output).toMatchObject(classification)
        expect(manifest[manifestSection][pathname]).toMatchObject(
          classification
        )
      }

      const omittedFallback = prerenders.find(
        (prerender) => prerender.pathname === '/omitted/[id]'
      )
      expect(omittedFallback).toBeDefined()
      expect(omittedFallback).not.toHaveProperty('routeType')
      expect(omittedFallback).not.toHaveProperty('response')
      expect(omittedFallback).not.toHaveProperty('compute')
    })

    it('exposes classification only on canonical responses', async () => {
      const prerenders = await getPrerenders()
      const completePage = prerenders.find((output) => output.pathname === '/')
      const blockingPage = prerenders.find(
        (output) => output.pathname === '/products/[slug]'
      )
      const route = prerenders.find(
        (output) => output.pathname === '/static-route'
      )
      const rsc = prerenders.find((output) => output.pathname === '/index.rsc')

      expect(completePage).toMatchObject({
        routeType: 'page',
        response: 'complete',
        compute: 'static',
        htmlSize: expect.any(Number),
      })
      expect(blockingPage).toMatchObject({
        routeType: 'page',
        response: 'empty',
        compute: 'blocking',
      })
      expect(blockingPage).not.toHaveProperty('htmlSize')
      expect(route).toMatchObject({
        routeType: 'route',
        response: 'complete',
        compute: 'static',
      })
      expect(route).not.toHaveProperty('htmlSize')

      expect(rsc).toBeDefined()
      expect(rsc).not.toHaveProperty('routeType')
      expect(rsc).not.toHaveProperty('response')
      expect(rsc).not.toHaveProperty('compute')
      expect(rsc).not.toHaveProperty('htmlSize')
    })
  }
)
