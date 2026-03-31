export const fetchCache = 'default-cache'

export default async function Page() {
  const [urlDefaultCache, valueDefaultCache] = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?a1'
  ).then((res) => Promise.all([res.url, res.text()]))

  const urlNoCache = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b2',
    { cache: 'no-store' }
  ).then((res) => res.url)

  const [urlCached, valueCached] = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?a1'
  ).then((res) => Promise.all([res.url, res.text()]))

  return (
    <>
      <p id="data-url-default-cache">{urlDefaultCache}</p>
      <p id="data-value-default-cache">{valueDefaultCache}</p>
      <p id="data-url-no-cache">{urlNoCache}</p>
      <p id="data-url-cached">{urlCached}</p>
      <p id="data-value-cached">{valueCached}</p>
    </>
  )
}
