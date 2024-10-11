import { NEXT_CACHE_IMPLICIT_TAG_ID } from '../../lib/constants'
import type { FallbackRouteParams } from '../request/fallback-params'

const getDerivedTags = (pathname: string): string[] => {
  const derivedTags: string[] = [`/layout`]

  // we automatically add the current path segments as tags
  // for revalidatePath handling
  if (pathname.startsWith('/')) {
    const pathnameParts = pathname.split('/')

    for (let i = 1; i < pathnameParts.length + 1; i++) {
      let curPathname = pathnameParts.slice(0, i).join('/')

      if (curPathname) {
        // all derived tags other than the page are layout tags
        if (!curPathname.endsWith('/page') && !curPathname.endsWith('/route')) {
          curPathname = `${curPathname}${
            !curPathname.endsWith('/') ? '/' : ''
          }layout`
        }
        derivedTags.push(curPathname)
      }
    }
  }
  return derivedTags
}

export function getImplicitTags(
  page: string,
  url: {
    pathname: string
    search?: string
  },
  fallbackRouteParams: null | FallbackRouteParams
) {
  // TODO: Cache the result
  const newTags: string[] = []
  const hasFallbackRouteParams =
    fallbackRouteParams && fallbackRouteParams.size > 0

  // Add the derived tags from the page.
  const derivedTags = getDerivedTags(page)
  for (let tag of derivedTags) {
    tag = `${NEXT_CACHE_IMPLICIT_TAG_ID}${tag}`
    newTags.push(tag)
  }

  // Add the tags from the pathname. If the route has unknown params, we don't
  // want to add the pathname as a tag, as it will be invalid.
  if (url.pathname && !hasFallbackRouteParams) {
    const tag = `${NEXT_CACHE_IMPLICIT_TAG_ID}${url.pathname}`
    newTags.push(tag)
  }

  return newTags
}
