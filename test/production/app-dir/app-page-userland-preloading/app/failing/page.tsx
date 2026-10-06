import { connection } from 'next/server'

await Promise.resolve()
console.log('page-preload:failing-loaded')
if (process.env.PAGE_PRELOAD_REJECT === '1') {
  throw new Error('page-preload:expected-failure')
}

export default async function Failing() {
  await connection()
  return <p>unreachable with runtime rejection enabled</p>
}
