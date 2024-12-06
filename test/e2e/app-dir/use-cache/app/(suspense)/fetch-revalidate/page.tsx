import React from 'react'

async function getData() {
  'use cache'

  return fetch('https://next-data-api-endpoint.vercel.app/api/random', {
    next: { revalidate: 0 },
  }).then((res) => res.text())
}

export default async function Page() {
  return (
    <>
      <p>index page</p>
      <p id="random">{await getData()}</p>
    </>
  )
}
