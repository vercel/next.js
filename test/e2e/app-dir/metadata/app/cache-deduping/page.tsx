import React, { cache } from 'react'

const getRandomMemoized = cache(() => Math.random())

async function getRandomMemoizedByFetch() {
  const res = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  )
  return res.text()
}

export default async function Page(props) {
  const val = getRandomMemoized()
  const val2 = await getRandomMemoizedByFetch()
  return (
    <>
      <p id="value">{val}</p>
      <p id="value2">{val2}</p>
    </>
  )
}

export async function generateMetadata(props, parent) {
  const val = getRandomMemoized()
  const val2 = await getRandomMemoizedByFetch()

  return {
    title: {
      default: JSON.stringify({ val, val2 }),
    },
  }
}
