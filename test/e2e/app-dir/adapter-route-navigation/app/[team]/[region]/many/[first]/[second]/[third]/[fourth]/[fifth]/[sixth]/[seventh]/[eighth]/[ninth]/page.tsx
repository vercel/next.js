import { Suspense } from 'react'

// This page tests routing, not an instant-navigation guarantee.
export const instant = false

type Props = {
  params: Promise<Record<string, string>>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

async function Content({ params, searchParams }: Props) {
  const parameters = await params
  const query = await searchParams

  return (
    <>
      <p id="article">{`Article ${parameters.ninth}`}</p>
      <pre id="parameters">{JSON.stringify(parameters)}</pre>
      <pre id="query">{JSON.stringify(query)}</pre>
    </>
  )
}

export default function Page(props: Props) {
  return (
    <>
      <h1>Many parameters</h1>
      <Suspense fallback={<p>Loading article</p>}>
        <Content {...props} />
      </Suspense>
    </>
  )
}
