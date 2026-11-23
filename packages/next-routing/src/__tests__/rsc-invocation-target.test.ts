import { resolveRoutes } from '../resolve-routes'
import type { ResolveRoutesParams, Route } from '../types'

function createReadableStream(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.close()
    },
  })
}

// The rewrite an adapter build emits for a fixed-path App Router page that has
// no prerendered `.rsc` output: its RSC and per-segment requests go to the
// page function.
function rscAlias(
  basePath: string,
  normalizedPathname: string,
  pathname: string
): Route {
  const escape = (value: string) =>
    value.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')
  return {
    sourceRegex: `^${escape(basePath)}${escape(normalizedPathname)}(?:\\.rsc|\\.segments/.+\\.segment\\.rsc)(?<rscsuff>)(?:/)?$`,
    destination: `${basePath}${pathname}`.replace(/\/$/, '') || '/',
  }
}

function resolve(
  url: string,
  {
    basePath = '',
    afterFiles,
    dynamicRoutes = [],
    pathnames,
  }: {
    basePath?: string
    afterFiles: Route[]
    dynamicRoutes?: Route[]
    pathnames: string[]
  }
) {
  const params: ResolveRoutesParams = {
    url: new URL(url, 'https://example.com'),
    buildId: 'BUILD_ID',
    basePath,
    requestBody: createReadableStream(),
    headers: new Headers(),
    pathnames,
    routes: {
      beforeMiddleware: [],
      beforeFiles: [],
      afterFiles,
      dynamicRoutes,
      onMatch: [],
      fallback: [],
    },
    invokeMiddleware: async () => ({}),
  }
  return resolveRoutes(params)
}

describe('invocation target of RSC requests rewritten to their page', () => {
  for (const basePath of ['', '/docs']) {
    describe(
      basePath ? `with base path ${basePath}` : 'without base path',
      () => {
        const page = (pathname: string) =>
          `${basePath}${pathname}`.replace(/\/$/, '') || '/'

        it.each([
          ['/about.rsc', '/about', '/about'],
          ['/about.segments/_tree.segment.rsc', '/about', '/about'],
          ['/index.rsc', '/', '/index'],
          ['/index.segments/_tree.segment.rsc', '/', '/index'],
          ['/index/index.rsc', '/index', '/index/index'],
        ])(
          'invokes %s with its own pathname when it resolves to %s',
          async (request, pathname, normalizedPathname) => {
            const result = await resolve(`${basePath}${request}?a=1`, {
              basePath,
              afterFiles: [rscAlias(basePath, normalizedPathname, pathname)],
              pathnames: [page('/'), page('/index'), page('/about')],
            })

            expect(result.resolvedPathname).toBe(page(pathname))
            expect(result.invocationTarget).toEqual({
              pathname: `${basePath}${request}`,
              query: { a: '1' },
            })
          }
        )
      }
    )
  }

  it('drops a trailing slash after the RSC suffix', async () => {
    const result = await resolve('/about.rsc/', {
      afterFiles: [rscAlias('', '/about', '/about')],
      pathnames: ['/about'],
    })

    expect(result.resolvedPathname).toBe('/about')
    expect(result.invocationTarget?.pathname).toBe('/about.rsc')
  })

  it('keeps the destination of a rewrite to another page', async () => {
    const result = await resolve('/old.rsc', {
      afterFiles: [{ sourceRegex: '^/old\\.rsc$', destination: '/new' }],
      pathnames: ['/new'],
    })

    expect(result.resolvedPathname).toBe('/new')
    expect(result.invocationTarget?.pathname).toBe('/new')
  })

  it('keeps the destination of a rewrite without an RSC suffix', async () => {
    const result = await resolve('/a', {
      afterFiles: [{ sourceRegex: '^/a$', destination: '/b' }],
      pathnames: ['/b'],
    })

    expect(result.invocationTarget?.pathname).toBe('/b')
  })

  it('keeps the request pathname of a dynamic route match', async () => {
    const result = await resolve('/blog/post.rsc', {
      afterFiles: [],
      dynamicRoutes: [
        {
          sourceRegex: '^/blog/(?<nxtPslug>[^/]+?)\\.rsc(?:/)?$',
          destination: '/blog/[slug]?nxtPslug=$nxtPslug',
        },
      ],
      pathnames: ['/blog/[slug]'],
    })

    expect(result.resolvedPathname).toBe('/blog/[slug]')
    expect(result.invocationTarget).toEqual({
      pathname: '/blog/post.rsc',
      query: { nxtPslug: 'post' },
    })
  })
})
