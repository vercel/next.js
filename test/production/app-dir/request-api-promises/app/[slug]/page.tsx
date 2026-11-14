import { Suspense } from 'react'
import { cookies, headers } from 'next/headers'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ query?: string }>
}

async function Dynamic({ params, searchParams }: Props) {
  const cookiesPromise = cookies()
  const headersPromise = headers()
  const same = (a: unknown, b: unknown) => (a === b ? 'same' : 'different')
  return (
    <p>
      {[
        `cookies:${same(cookiesPromise, cookies())}:${(await cookiesPromise).get('session')?.value}`,
        `headers:${same(headersPromise, headers())}:${(await headersPromise).get('x-test')}`,
        `params:${(await params).slug}`,
        `searchParams:${(await searchParams).query}`,
      ].join(' ')}
    </p>
  )
}

export default function Page(props: Props) {
  return (
    <Suspense>
      <Dynamic {...props} />
    </Suspense>
  )
}
