import { connection } from 'next/server'
import { Suspense } from 'react'
import { Form } from './form'

export default function Page() {
  return (
    <div>
      <Suspense fallback={<h1>Loading...</h1>}>
        <Dynamic />
      </Suspense>
      <CachedForm />
    </div>
  )
}

async function CachedForm() {
  'use cache'

  return (
    <Form
      getDate={async () => {
        'use cache'
        return new Date().toISOString()
      }}
      getRandom={async function getRandom() {
        'use cache'
        return Math.random()
      }}
    />
  )
}

const Dynamic = async () => {
  await connection()
  return <h1>Dynamic</h1>
}
