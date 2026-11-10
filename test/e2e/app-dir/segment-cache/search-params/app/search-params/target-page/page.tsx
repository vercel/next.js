import { Suspense } from 'react'
import { LinkAccordion } from '../../../components/link-accordion'

async function Content({ searchParams }) {
  const { searchParam } = await searchParams
  return `Search param: ${searchParam}`
}

export default async function Target({ searchParams }) {
  return (
    <Suspense fallback="Loading...">
      <div id="target-page-with-search-param">
        <Content searchParams={searchParams} />
      </div>
      <LinkAccordion
        prefetch={true}
        href="/search-params/target-page?searchParam=query_only"
      >
        Change search params
      </LinkAccordion>
      <LinkAccordion href="/search-params/target-page?searchParam=hello+world,/x&unused&searchParam=another%20value">
        Navigate with encoded and repeated search params
      </LinkAccordion>
    </Suspense>
  )
}
