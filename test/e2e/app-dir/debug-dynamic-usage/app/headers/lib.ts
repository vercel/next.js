import { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers'

export async function getUserAgent(headers: Promise<ReadonlyHeaders>) {
  const headersList = await headers
  const userAgent = headersList.get('user-agent')

  return userAgent
}
