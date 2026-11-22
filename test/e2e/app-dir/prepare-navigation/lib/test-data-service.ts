import 'server-only'

import { connection } from 'next/server'

// Reads `key` from the test's data service, so the test controls when each
// part of a page streams in. Without the service (in a deployment), resolves
// to the key immediately.
export async function getTestData(key: string): Promise<string> {
  await connection()
  const url = process.env.TEST_DATA_SERVICE_URL
  if (!url) {
    return key
  }
  const response = await fetch(`${url}?${new URLSearchParams({ key })}`, {
    cache: 'no-store',
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text)
  }
  return text
}
