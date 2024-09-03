import { unstable_noStore as noStore } from 'next/cache'

export default async function Page() {
  // this page is using unstable_noStore() to opt into dynamic rendering
  // meaning the page will bail from ISR cache and hint to patch-fetch
  // that it's in a dynamic scope and shouldn't cache the fetch.
  noStore()
  const data1 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?1',
    { cache: 'default' }
  ).then((res) => res.text())
  const data2 = await fetch(
    new Request('https://next-data-api-endpoint.vercel.app/api/random?2')
  ).then((res) => res.text())

  const data3 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?3'
  ).then((res) => res.text())

  return (
    <>
      <p>/default-cache-fetch</p>
      <p id="data-default-cache">"cache: default" {data1}</p>
      <p id="data-request-cache">
        "cache: default" (Request constructor) {data2}
      </p>
      <p id="data-cache-auto">"cache: auto" {data3}</p>
    </>
  )
}
