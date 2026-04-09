import { headers } from 'next/headers'

export default async function Page({ params }) {
  const data = await headers()

  return (
    <>
      <p id="page">/dyn/[slug]</p>
      <p id="params">{JSON.stringify(params)}</p>
      <p id="now">{Date.now()}</p>
      <p id="data">{data}</p>
    </>
  )
}
