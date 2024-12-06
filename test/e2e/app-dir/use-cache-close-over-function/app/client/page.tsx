import { Client } from './client'

function createCachedFn(start: number) {
  function fn() {
    return start
  }

  return async () => {
    'use cache'
    return Math.random() + fn()
  }
}

export default async function Page() {
  return <Client getValue={createCachedFn(42)} />
}
