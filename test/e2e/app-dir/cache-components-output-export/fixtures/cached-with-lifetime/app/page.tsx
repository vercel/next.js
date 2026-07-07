import { cacheLife } from 'next/cache'

async function getMessage() {
  'use cache'
  cacheLife('minutes')
  return 'cached-with-lifetime'
}

export default async function Page() {
  return <p>{await getMessage()}</p>
}
