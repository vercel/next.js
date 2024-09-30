import { getSentinelValue } from '../../getSentinelValue'

export default function Page({ searchParams }: { searchParams: Promise<any> }) {
  return (
    <>
      <p>
        This page reads `searchParams.foo` in a client component without a
        parent Suspense boundary.
      </p>
      <p>
        With PPR this page has an empty shell because the dynamic API usage is
        not inside a Suspense boundary.
      </p>
      <p>
        Without PPR this page is fully dynamic because a dynamic API was used.
      </p>
      <ComponentOne searchParams={searchParams} />
      <ComponentTwo />
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function ComponentOne({ searchParams }: { searchParams: Promise<any> }) {
  let sentinelSearch
  const sp = await searchParams
  try {
    if (sp.sentinel) {
      sentinelSearch = sp.sentinel
    } else {
      sentinelSearch = '~not-found~'
    }
  } catch (e) {
    sentinelSearch = '~thrown~'
    // swallow any throw. We should still not be static
  }
  return (
    <div>
      This component accessed `searchParams.sentinel`: "
      <span id="value">{sentinelSearch}</span>"
    </div>
  )
}

function ComponentTwo() {
  return (
    <>
      <div>This component didn't access any searchParams properties</div>
      <div id="inner">{getSentinelValue()}</div>
    </>
  )
}
