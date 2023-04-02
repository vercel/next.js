import { cache, use } from 'react'

export default function Page() {
  const getData = cache(() =>
    fetch('https://next-data-api-endpoint.vercel.app/api/random?page', {
      next: { revalidate: 360 },
    }).then((res) => res.text())
  )
  const dataPromise = getData()
  const data = use(dataPromise)

  return (
    <>
      <p id="page">/variable-revalidate/revalidate-360</p>
      <p id="page-data">revalidate 360: {data}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
