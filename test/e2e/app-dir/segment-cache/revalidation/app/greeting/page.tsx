'use cache'

import { unstable_cacheTag as cacheTag } from 'next/cache'
import { Suspense } from 'react'

const TEST_DATA_SERVICE_URL = process.env.TEST_DATA_SERVICE_URL
const ARTIFICIAL_DELAY = 3000

async function Greeting() {
  cacheTag('random-greeting')
  if (!TEST_DATA_SERVICE_URL) {
    // If environment variable is not set, resolve automatically after a delay.
    // This is so you can run the test app locally without spinning up a
    // data server.
    await new Promise<void>((resolve) =>
      setTimeout(() => resolve(), ARTIFICIAL_DELAY)
    )
    // Return a random greeting
    return ['Hello', 'Hi', 'Hey', 'Howdy'][Math.floor(Math.random() * 4)]
  }
  const response = await fetch(TEST_DATA_SERVICE_URL + '?key=random-greeting')
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(text)
  }
  return (
    <>
      <h1>Greeting</h1>
      <div id="greeting">{text}</div>
    </>
  )
}

export default async function Page() {
  return (
    <Suspense fallback="Loading...">
      <Greeting />
    </Suspense>
  )
}
