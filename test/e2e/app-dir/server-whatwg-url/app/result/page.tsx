import { Suspense } from 'react'

async function Result({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <pre id="result">{JSON.stringify(await searchParams)}</pre>
}

export default function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <Suspense>
      <Result {...props} />
    </Suspense>
  )
}
