import { cacheLife } from 'next/cache'

async function getValue() {
  'use cache'
  cacheLife({ revalidate: 60, expire: 300 })
  return new Date().toISOString()
}

export default async function Page() {
  return <p id="value">{await getValue()}</p>
}
