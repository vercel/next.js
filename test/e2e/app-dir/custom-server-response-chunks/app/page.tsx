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
  return <Client text={text} />
}
