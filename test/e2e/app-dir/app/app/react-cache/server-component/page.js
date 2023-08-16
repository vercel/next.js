import { cache } from 'react'

const getRandomMemoized = cache(() => Math.random())

export default function Page() {
  const val1 = getRandomMemoized()
  const val2 = getRandomMemoized()
  return (
    <>
      <h1>React Cache Server Component</h1>
      <p id="value-1">{val1}</p>
      <p id="value-2">{val2}</p>
    </>
  )
}
