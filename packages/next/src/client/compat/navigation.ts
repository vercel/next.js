import { useContext, useMemo } from 'react'
import {
  PathnameContext,
  SearchParamsContext,
} from '../../shared/lib/hooks-client-context'
import { ReadonlyURLSearchParams } from '../components/readonly-url-search-params'
import { staticGenerationBailout } from '../components/static-generation-bailout'

/**
 * useRouter here is already fully backwards compatible in both `pages/` and in
 * `app/`.
 */
export { useRouter } from '../components/navigation'

/**
 * usePathname from `next/compat/navigation`, much like the hook from
 * `next/navigation` returns the pathname with the dynamic params substituted
 * in. Unlike the hook in `next/navigation`, this will return `null` when
 * the pathname is not available.
 *
 * This can only happen when the hook is used from a pages directory and the
 * page being rendered has been automatically statically optimized or the page
 * being rendered is the fallback page.
 *
 * @returns the pathname if available
 */
export function usePathname(): string | null {
  return useContext(PathnameContext)
}

/**
 * useSearchParams from `next/compat/navigation`, much like the hook from
 * `next/navigation` returns the URLSearchParams object for the search
 * parameters. Unlike the hook  in `next/navigation`, this will return `null`
 * when the search params are not available.
 *
 * It will be `null` during prerendering if the page doesn't use Server-side
 * Rendering. See https://nextjs.org/docs/basic-features/data-fetching/get-server-side-props
 *
 * @returns the search params if available
 */
export function useSearchParams(): URLSearchParams | null {
  // When ran, ensure we don't build the page for static.
  staticGenerationBailout('useSearchParams')

  const searchParams = useContext(SearchParamsContext)

  return useMemo(() => {
    if (!searchParams) {
      // When the router is not ready in pages, we won't have the search params
      // available.
      return null
    }

    return new ReadonlyURLSearchParams(searchParams)
  }, [searchParams])
}
