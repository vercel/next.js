'use client'

import {
  useOptimisticPathname,
  useOptimisticSearchParams,
  usePathname,
  useSearchParams,
} from 'next/navigation'

import Link from 'next/link'

export default function Layout({ children }) {
  const optimisticPathname = useOptimisticPathname()
  const optimisticSearchParams = useOptimisticSearchParams()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return (
    <>
      <p>
        optimisticPathname=
        <span id="optimistic-pathname">{optimisticPathname}</span>
      </p>
      <p>
        pathname=
        <span id="pathname">{pathname}</span>
      </p>
      <p>
        optimisticSearchParams=
        <span id="optimistic-search-params">
          {optimisticSearchParams.toString()}
        </span>
      </p>
      <p>
        searchParams=
        <span id="search-params">{searchParams.toString()}</span>
      </p>
      <Link
        id="navigation-link"
        href="/hooks/use-optimistic-pathname-and-search-params/dynamic/1?id=1"
      >
        Navigate to Dynamic Page
      </Link>
      <div>{children}</div>
    </>
  )
}
