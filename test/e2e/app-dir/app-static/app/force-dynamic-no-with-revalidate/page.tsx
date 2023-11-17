import React from 'react'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      next: {
        revalidate: 100,
      },
    }
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/force-dynamic-no-with-revalidate</p>
      <p id="data">{data}</p>
    </>
  )
}
