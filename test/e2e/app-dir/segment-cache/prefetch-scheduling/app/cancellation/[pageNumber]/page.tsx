import { Suspense } from 'react'

type Params = {
  pageNumber: string
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
  for (let n = 1; n <= 1; n++) {
    result.push({ pageNumber: n.toString() })
  }
  return result
}
