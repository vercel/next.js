import { connection } from 'next/server'
import { Suspense } from 'react'
import { text } from '../data'
import { Client } from './client'

export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Content />
    </Suspense>
  )
}

async function Content() {
  await connection()
  const storage = new Uint8Array([17, 0, 255, 128, 60, 195, 169, 18])
  return (
    <Client
      text={text}
      bytes={storage.subarray(1, -1)}
      later={Promise.resolve(text)}
    />
  )
}
