import { LinkAccordion } from '../../../components/link-accordion'

// The page segment itself is fully static — it doesn't access searchParams
// or cookies. Only the metadata accesses searchParams (making the head
// depend on runtime data) and the [item] param (so it differs per route).
// The page segment content is the same for all param values.
export async function generateStaticParams() {
  return [{ item: 'a' }, { item: 'b' }]
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ item: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { item } = await params
  const { q } = await searchParams
  return { title: `Independent Head Title: ${item}${q ? ` (q=${q})` : ''}` }
}

export default async function Page({
  params,
}: {
  params: Promise<{ item: string }>
}) {
  const { item } = await params
  const sibling = item === 'a' ? 'b' : 'a'
  return (
    <div>
      <p id="page-independent-head">Independent head page</p>
      <LinkAccordion href={`/test-independent-head/${sibling}`}>
        Go to {sibling}
      </LinkAccordion>
    </div>
  )
}
