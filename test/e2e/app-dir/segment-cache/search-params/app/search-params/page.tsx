import { Suspense } from 'react'
import { LinkAccordion } from '../../components/link-accordion'

export default function SearchParamsPage({
  searchParams,
}: {
  searchParams: Promise<{ greeting?: string }>
}) {
  return (
    <>
      <p>
        Demonstrates that we can prefetch a page that reads from search params
      </p>
      <ul>
        <li>
          <LinkAccordion href="/search-params/target-page?searchParam=a_PPR">
            searchParam=a_PPR
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion
            prefetch="unstable_forceStale"
            href="/search-params/target-page?searchParam=b_full"
          >
            searchParam=b_full, prefetch="unstable_forceStale"
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/search-params/target-page?searchParam=c_PPR">
            searchParam=c_PPR
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion
            prefetch="unstable_forceStale"
            href="/search-params/target-page?searchParam=d_full"
          >
            searchParam=d_full, prefetch="unstable_forceStale"
          </LinkAccordion>
        </li>
      </ul>
      <p>
        Demonstrates that pages that render based on search params are cached
        correctly even during a rewrite. Because each of the links below rewrite
        to the same URL, they only need to fetch the page once (note: there will
        still be separate requests for the route trees, but not for the page
        data itself).
      </p>
      <ul>
        <li>
          <LinkAccordion
            prefetch={true}
            href="/search-params/target-page?searchParam=rewritesToANewSearchParam"
          >
            searchParam=rewritesToANewSearchParam, prefetch=true
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion
            prefetch={true}
            href="/search-params/target-page?searchParam=alsoRewritesToThatSameSearchParam"
          >
            searchParam=alsoRewritesToThatSameSearchParam, prefetch=true
          </LinkAccordion>
        </li>
      </ul>
      <p>
        The first link rewrites to the current page, but with an additional
        search param. The router must be able to detect that something on the
        new page has changed. So, clicking the first link should cause the
        current page to re-render, but with a greeting rendered below.
      </p>
      <p>
        The second link rewrites to the current page, but without any search
        params. Clicking this link after clicking the first one should cause the
        greeting to disappear.
      </p>
      <ul>
        <li>
          <LinkAccordion prefetch={true} href="/search-params-with-greeting">
            Rewrite to current page with additional ?greeting=hello search
            param, prefetch=true
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion prefetch={true} href="/search-params-with-no-greeting">
            Rewrite to current page without any search params, prefetch=true
          </LinkAccordion>
        </li>
      </ul>
      <Suspense fallback={null}>
        <Greeting searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Greeting({
  searchParams,
}: {
  searchParams: Promise<{ greeting?: string }>
}) {
  const { greeting } = await searchParams
  return (
    <p id="greeting">{`Greeting (from search params): ${greeting ?? '(none)'}`}</p>
  )
}
