import { cookies } from 'next/headers'
import React from 'react'

async function getData() {
  'use cache'

  return fetch('https://next-data-api-endpoint.vercel.app/api/random', {
    headers: {
      Authorization: `Bearer ${process.env.MY_TOKEN}`,
    },
  }).then((res) => res.text())
}

export default async function Page() {
  const myCookies = await cookies()
  const id = myCookies.get('id')?.value

  return (
    <>
      <p>index page</p>
      <p id="random">{await getData()}</p>
      <p id="my-id">{id || ''}</p>
    </>
  )
}
