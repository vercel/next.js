import { cache, use } from 'react'

export const runtime = 'experimental-edge'

export default function Page() {
  const getData = cache(() =>
    fetch('https://next-data-api-endpoint.vercel.app/api/random?page', {
      cache: 'no-store',
    }).then((res) => res.text())
  )
  const dataPromise = getData()
  const data = use(dataPromise)

  return (
    <>
      <p id="page">/variable-revalidate/no-cache</p>
      <p id="page-data">no-store: {data}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
