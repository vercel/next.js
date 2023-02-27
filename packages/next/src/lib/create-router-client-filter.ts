import { BloomFilter } from '../shared/lib/bloom-filter'
import { isDynamicRoute } from '../shared/lib/router/utils'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { Redirect } from './load-custom-routes'

const POTENTIAL_ERROR_RATE = 0.02

export function createClientRouterFilter(
  paths: string[],
  redirects: Redirect[]
): {
  staticFilter: ReturnType<BloomFilter['export']>
  dynamicFilter: ReturnType<BloomFilter['export']>
} {
  const staticPaths = new Set<string>()
  const dynamicPaths = new Set<string>()

  for (const path of paths) {
    if (isDynamicRoute(path)) {
      let subPath = ''
      const pathParts = path.split('/')

      // start at 1 since we split on '/' and the path starts
      // with this so the first entry is an empty string
      for (let i = 1; i < pathParts.length + 1; i++) {
        const curPart = pathParts[i]

        if (curPart.startsWith('[')) {
          break
        }
        subPath = `${subPath}/${curPart}`
      }

      if (subPath) {
        dynamicPaths.add(subPath)
      }
    } else {
      staticPaths.add(path)
    }
  }

  for (const redirect of redirects) {
    const { source } = redirect
    const path = removeTrailingSlash(source)

    if (path.includes(':') || path.includes('(')) {
      let subPath = ''
      const pathParts = path.split('/')

      for (let i = 1; i < pathParts.length + 1; i++) {
        const curPart = pathParts[i]

        if (curPart.includes(':') || curPart.includes('(')) {
          break
        }
        subPath = `${subPath}/${curPart}`
      }

      // if redirect has matcher at top-level we don't include this
      // as it would match everything
      if (subPath) {
        dynamicPaths.add(subPath)
      }
    } else {
      staticPaths.add(path)
    }
  }

  const staticFilter = BloomFilter.from([...staticPaths], POTENTIAL_ERROR_RATE)

  const dynamicFilter = BloomFilter.from(
    [...dynamicPaths],
    POTENTIAL_ERROR_RATE
  )
  const data = {
    staticFilter: staticFilter.export(),
    dynamicFilter: dynamicFilter.export(),
  }
  return data
}
