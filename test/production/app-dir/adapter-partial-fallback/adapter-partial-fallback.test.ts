import fs from 'fs'
import { resolveRoutes } from '../../../../packages/next-routing/src'
import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

describe('adapter-partial-fallback', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should emit partial fallback metadata when infra can upgrade the shell', async () => {
    const {
      outputs,
      routing,
      buildId,
      config,
    }: Parameters<NextAdapter['onBuildComplete']>[0] = await next.readJSON(
      'build-complete.json'
    )
    const basePath = '/docs'
    expect(config.basePath).toBe(basePath)

    const withGspPrerender = outputs.prerenders.find(
      (output) => output.pathname === `${basePath}/with-gsp/[slug]`
    )
    const withGspOtherSegmentPrerenders = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith(`${basePath}/with-gsp/[slug].segments/`) &&
        output.pathname !==
          `${basePath}/with-gsp/[slug].segments/_tree.segment.rsc`
    )
    const withoutGspPrerender = outputs.prerenders.find(
      (output) => output.pathname === `${basePath}/without-gsp/[slug]`
    )
    const withoutGspOtherSegmentPrerenders = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith(
          `${basePath}/without-gsp/[slug].segments/`
        ) &&
        output.pathname !==
          `${basePath}/without-gsp/[slug].segments/_tree.segment.rsc`
    )
    const genericPrefixPrerender = outputs.prerenders.find(
      (output) => output.pathname === `${basePath}/prefix/[one]/[two]`
    )
    const genericPrefixOtherSegmentPrerenders = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith(
          `${basePath}/prefix/[one]/[two].segments/`
        ) &&
        output.pathname !==
          `${basePath}/prefix/[one]/[two].segments/_tree.segment.rsc`
    )
    const generatedPrefixPrerender = outputs.prerenders.find(
      (output) => output.pathname === `${basePath}/prefix/b/[two]`
    )
    const genericDashedPrerender = outputs.prerenders.find(
      (output) => output.pathname === `${basePath}/dashed/[my-slug]/[two]`
    )
    const generatedDashedPrerender = outputs.prerenders.find(
      (output) => output.pathname === `${basePath}/dashed/b/[two]`
    )

    expect(withGspPrerender).toBeDefined()
    expect(withGspOtherSegmentPrerenders.length).toBeGreaterThan(0)
    expect(withoutGspPrerender).toBeDefined()
    expect(withoutGspOtherSegmentPrerenders.length).toBeGreaterThan(0)
    expect(genericPrefixPrerender).toBeDefined()
    expect(genericPrefixOtherSegmentPrerenders.length).toBeGreaterThan(0)
    expect(generatedPrefixPrerender).toBeDefined()
    expect(genericDashedPrerender).toBeDefined()
    expect(generatedDashedPrerender).toBeDefined()

    expect(withGspPrerender.config.partialFallback).toBe(true)
    expect(withGspPrerender.config.allowQuery).toEqual(['nxtPslug'])
    for (const output of withGspOtherSegmentPrerenders) {
      expect(output.config.partialFallback).toBe(true)
      expect(output.config.allowQuery).toEqual(['nxtPslug'])
    }

    expect(withoutGspPrerender.config.partialFallback).toBeUndefined()
    expect(withoutGspPrerender.config.allowQuery).toEqual([])
    for (const output of withoutGspOtherSegmentPrerenders) {
      expect(output.config.partialFallback).toBeUndefined()
      expect(output.config.allowQuery).toEqual([])
    }

    expect(genericPrefixPrerender.config.partialFallback).toBe(true)
    expect(genericPrefixPrerender.config.allowQuery).toEqual(['nxtPone'])
    for (const output of genericPrefixOtherSegmentPrerenders) {
      expect(output.config.partialFallback).toBe(true)
      expect(output.config.allowQuery).toEqual(['nxtPone'])
    }

    expect(generatedPrefixPrerender.config.partialFallback).toBeUndefined()
    expect(generatedPrefixPrerender.config.allowQuery).toEqual([])

    expect(genericDashedPrerender.config.partialFallback).toBe(true)
    expect(genericDashedPrerender.config.allowQuery).toEqual(['nxtPmy-slug'])

    expect(generatedDashedPrerender.config.partialFallback).toBeUndefined()
    expect(generatedDashedPrerender.config.allowQuery).toEqual([])

    const routeTreeSuffix = '.segments/_tree.segment.rsc'
    expect(
      outputs.prerenders.filter((output) =>
        output.pathname.endsWith(routeTreeSuffix)
      )
    ).toEqual([])

    const routeTreeStaticOutputs = outputs.staticFiles.filter((output) =>
      output.pathname.endsWith(routeTreeSuffix)
    )
    const expectedRouteTrees = [
      '/with-gsp/one.segments/_tree.segment.rsc',
      '/with-gsp/[slug].segments/_tree.segment.rsc',
      '/without-gsp/[slug].segments/_tree.segment.rsc',
      '/prefix/[one]/[two].segments/_tree.segment.rsc',
    ]

    for (const id of expectedRouteTrees) {
      const pathname = `${basePath}${id}`
      const matchingOutputs = routeTreeStaticOutputs.filter(
        (output) => output.pathname === pathname
      )
      expect(matchingOutputs).toHaveLength(1)
      expect(matchingOutputs[0]).toEqual(
        expect.objectContaining({
          id,
          pathname,
          type: 'STATIC_FILE',
        })
      )
      expect(matchingOutputs[0].immutableHash).toBeUndefined()
    }

    for (const output of routeTreeStaticOutputs) {
      expect(output.filePath).toMatch(/\.segments[/\\]_tree\.segment\.rsc$/)
      expect((await fs.promises.stat(output.filePath)).isFile()).toBe(true)
    }

    const routeTreeOnMatch = routing.onMatch[routing.onMatch.length - 1]
    expect(routeTreeOnMatch.headers).toEqual({
      vary: routing.rsc.varyHeader,
      'content-type': routing.rsc.contentTypeHeader,
      [routing.rsc.didPostponeHeader]: '2',
    })

    const routeTreeRegex = new RegExp(routeTreeOnMatch.sourceRegex)
    expect(
      routeTreeRegex.test(`${basePath}/with-gsp/one.segments/_tree.segment.rsc`)
    ).toBe(true)
    expect(
      routeTreeRegex.test('/with-gsp/one.segments/_tree.segment.rsc')
    ).toBe(false)
    expect(
      routeTreeRegex.test(
        `${basePath}/with-gsp/two.segments/__PAGE__.segment.rsc`
      )
    ).toBe(false)

    const concreteTreePathname = `${basePath}/with-gsp/two.segments/_tree.segment.rsc`
    const resolvedTreeRoute = await resolveRoutes({
      url: new URL(`https://example.com${concreteTreePathname}`),
      buildId,
      basePath,
      requestBody: new ReadableStream({
        start(controller) {
          controller.close()
        },
      }),
      headers: new Headers(),
      pathnames: [
        ...outputs.pages,
        ...outputs.pagesApi,
        ...outputs.appPages,
        ...outputs.appRoutes,
        ...outputs.prerenders,
        ...outputs.staticFiles,
      ].map((output) => output.pathname),
      routes: routing,
      invokeMiddleware: async () => ({}),
    })

    expect(resolvedTreeRoute.resolvedPathname).toBe(
      `${basePath}/with-gsp/[slug].segments/_tree.segment.rsc`
    )
    expect(resolvedTreeRoute.invocationTarget?.pathname).toBe(
      concreteTreePathname
    )
    expect(
      resolvedTreeRoute.resolvedHeaders?.get(routing.rsc.didPostponeHeader)
    ).toBe('2')
    expect(resolvedTreeRoute.resolvedHeaders?.get('content-type')).toBe(
      routing.rsc.contentTypeHeader
    )
    expect(resolvedTreeRoute.resolvedHeaders?.get('vary')).toBe(
      routing.rsc.varyHeader
    )
  })
})
