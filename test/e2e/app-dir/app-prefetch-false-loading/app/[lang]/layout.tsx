import React from 'react'
export default async function Root({
  children,
}: {
  children: React.ReactNode
}) {
  console.log('re-fetching in layout')
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    // ensure that we never show a cached value here to validate
    // that navigating between segments is not refreshing the value
    { cache: 'no-store' }
  )
  const randomNumber = await data.text()
  return (
    <div>
      <p id="random-number">{randomNumber}</p>
      {children}
    </div>
  )
}
