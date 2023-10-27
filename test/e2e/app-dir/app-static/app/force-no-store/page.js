import { cache, use } from 'react'

export const fetchCache = 'force-no-store'

export default function Page() {
  const getData = cache(() =>
    fetch('https://next-data-api-endpoint.vercel.app/api/random?page', {}).then(
      (res) => res.text()
    )
  )
  const dataPromise = getData()
  const data = use(dataPromise)

  return (
    <>
      <p id="page">/force-no-store</p>
      <p id="page-data">{data}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
