import { connection } from 'next/server'

async function getRandomValue(offset: number) {
  'use cache: remote'
  return Math.random() + offset
}

let renderCount = 0

export default async function Page() {
  await connection()

  // Create the offsets array based on the render count to force a different
  // array on each render.
  const offsets = renderCount++ % 2 === 0 ? [0, 1] : [1, 0]

  // Pass the function reference into the map function, which will pass the
  // index and array as arguments into getRandomValue. This will create cache
  // misses if the unused arguments are not properly ignored, because they would
  // be included in the cache keys.
  const randomNumbers = await Promise.all(offsets.map(getRandomValue))

  return <p id="numbers">{randomNumbers.sort().join(' ')}</p>
}
