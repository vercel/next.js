import 'server-only'

import { unstable_noStore } from 'next/cache'

// NOTE: I've intentionally not yet moved these helpers into a shared module, to
// avoid early abstraction. I will if/when we start using them for other tests.
// They are based on the testing patterns we use all over the React codebase, so
// I'm reasonably confident in them.
const TEST_DATA_SERVICE_URL = process.env.TEST_DATA_SERVICE_URL
const ARTIFICIAL_DELAY = 3000

async function getTestData(key: string, isStatic: boolean): Promise<string> {
  const searchParams = new URLSearchParams({
    key,
  })
  if (!TEST_DATA_SERVICE_URL) {
    // If environment variable is not set, resolve automatically after a delay.
    // This is so you can run the test app locally without spinning up a
    // data server.
    await new Promise<void>((resolve) =>
      setTimeout(() => resolve(), ARTIFICIAL_DELAY)
    )
    if (!isStatic) {
      unstable_noStore()
    }
    return key
  }
  const response = await fetch(
    TEST_DATA_SERVICE_URL + '?' + searchParams.toString(),
    {
      cache: isStatic ? 'force-cache' : 'no-store',
    }
  )
  const text = await response.text()
  if (response.status !== 200) {
    throw new Error(text)
  }
  return text
}

export async function getStaticTestData(key: string): Promise<string> {
  return getTestData(key, true)
}

export async function getDynamicTestData(key: string): Promise<string> {
  return getTestData(key, false)
}
