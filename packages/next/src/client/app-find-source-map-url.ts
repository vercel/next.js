const basePath = process.env.__NEXT_ROUTER_BASEPATH || ''
const pathname = `${basePath}/__nextjs_source-map`

export const findSourceMapURL =
  process.env.NODE_ENV === 'development'
    ? function findSourceMapURL(filename: string): string | null {
        if (filename === '') {
          return null
        }

        const url = new URL(pathname, document.location.origin)

        url.searchParams.set(
          'filename',
          filename.replace(
            new RegExp(`^${document.location.origin}${basePath}`),
            ''
          )
        )

        return url.href
      }
    : undefined
