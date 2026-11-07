import { Suspense } from 'react'
import { connection } from 'next/server'
import { shortExpire } from '../cache'
export const instant = true
async function Cached() {
  return <p>{await shortExpire()}</p>
}
async function Uncached() {
  await connection()
  return <p>Uncached</p>
}
export default function Page() {
  return (
    <>
      <Suspense fallback={<p>Loading</p>}>
        <Cached />
      </Suspense>
      <Uncached />
    </>
  )
}
