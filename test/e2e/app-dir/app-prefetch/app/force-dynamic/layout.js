import React from 'react'

export const dynamic = 'force-dynamic'

export default async function Layout({ children }) {
  console.log('re-fetching in layout')
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  )
  const randomNumber = await data.text()

  return (
    <div>
      <p id="random-number">{randomNumber}</p>

      {children}
    </div>
  )
}
