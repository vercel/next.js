import { cookies } from 'next/headers'
import { Suspense } from 'react'

const patchFetch = (originalFetch) => async (url, options) => {
  const res = await originalFetch(url, options)
  return res
}

const customFetch = patchFetch(fetch)

export default async function Page() {
  const data = await customFetch(
    'https://next-data-api-endpoint.vercel.app/api/random?revalidate-3',
    {
      next: {
        revalidate: 3,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <div id="random">{data}</div>
      <Suspense fallback={<div>Loading...</div>}>
        <DynamicThing />
      </Suspense>
    </>
  )
}

async function DynamicThing() {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('name')

  return <div>{cookie}</div>
}
