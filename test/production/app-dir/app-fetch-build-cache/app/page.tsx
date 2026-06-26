import React from 'react'

export const revalidate = 30

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  ).then((res) => res.text())

  return (
    <>
      <p id="page">index page</p>
      <p id="data">{data}</p>
    </>
  )
}
