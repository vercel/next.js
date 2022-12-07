import { cache, use } from 'react'

export default function Layout({ children }) {
  const getData = cache(() =>
    fetch('https://next-data-api-endpoint.vercel.app/api/random?layout', {
      next: { revalidate: 10 },
    }).then((res) => res.text())
  )
  const dataPromise = getData()
  const data = use(dataPromise)

  return (
    <>
      <p id="layout-data">revalidate 10: {data}</p>
      {children}
    </>
  )
}
