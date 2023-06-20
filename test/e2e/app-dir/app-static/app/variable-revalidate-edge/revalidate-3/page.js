import { cache, use } from 'react'

export const runtime = 'experimental-edge'
export const dynamic = 'force-static'

export default function Page() {
  const getData = cache(() =>
    fetch('https://next-data-api-endpoint.vercel.app/api/random?page', {
      next: { revalidate: 3 },
    }).then((res) => res.text())
  )
  const dataPromise = getData()
  const data = use(dataPromise)

  return (
    <>
      <p id="page">/variable-revalidate/revalidate-3</p>
      <p id="page-data">revalidate 3: {data}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
