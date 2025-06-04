import { unstable_rootParams } from 'next/server'

export default async function Page() {
  const rootParams = await getCachedParams()
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  return (
    <p>
      <span id="param">
        {rootParams.lang} {rootParams.locale}
      </span>{' '}
      <span id="random">{data}</span>
    </p>
  )
}

async function getCachedParams() {
  'use cache'
  return unstable_rootParams()
}
