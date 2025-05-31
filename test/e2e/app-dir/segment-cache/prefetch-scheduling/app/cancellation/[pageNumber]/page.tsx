import { Suspense } from 'react'

type Params = {
  pageNumber: string
}

export async function generateViewport({
  params,
}: {
  params: Promise<Params>
}) {
  const { pageNumber } = await params
  return {
    // Put the page number into the media query. This is just a trick to allow
    // the test to detect when the viewport for this page has been prefetched.
    themeColor: [{ media: `(min-width: ${pageNumber}px)`, color: 'light' }],
  }
}

async function Content({ params }: { params: Promise<Params> }) {
  const { pageNumber } = await params
  return 'Content of page ' + pageNumber
}

export default async function LinkCancellationTargetPage({
  params,
}: {
  params: Promise<Params>
}) {
  return (
    <Suspense fallback="Loading...">
      <Content params={params} />
    </Suspense>
  )
}

export async function generateStaticParams(): Promise<Array<Params>> {
  const result: Array<Params> = []
  for (let n = 1; n <= 10; n++) {
    result.push({ pageNumber: n.toString() })
  }
  return result
}
