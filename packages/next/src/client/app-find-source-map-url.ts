const basePath = process.env.__NEXT_ROUTER_BASEPATH || ''
const pathname = `${basePath}/__nextjs_source-map`

export const findSourceMapURL =
  process.env.NODE_ENV === 'development'
    ? function findSourceMapURL(filename: string): string | null {
        if (filename === '') {
          return null
        }

        if (
          filename.startsWith(document.location.origin) &&
          filename.includes('/_next/static')
        ) {
          // This is a request for a client chunk. This can only happen when
          // using Turbopack. In this case, since we control how those source
          // maps are generated, we can safely assume that the sourceMappingURL
          // is relative to the filename, with an added `.map` extension. The
          // browser can just request this file, and it gets served through the
          // normal dev server, without the need to route this through
          // the `/__nextjs_source-map` dev middleware.
          return `${filename}.map`
        }

        const url = new URL(pathname, document.location.origin)
        url.searchParams.set('filename', filename)

        return url.href
      }
    : undefined
