import { connection } from 'next/server'
import { Suspense } from 'react'
import { Form } from './form'

export default function Page() {
  return (
    <div>
      <Suspense fallback={<h1>Loading...</h1>}>
        <Dynamic />
      </Suspense>
      <CachedForm subject="World" />
    </div>
  )
}

async function CachedForm({ subject }: { subject: string }) {
  'use cache'

  return (
    <Form
      sayHi={async function hi() {
        'use server'
        return `Hi, ${subject}!`
      }}
      sayHello={async () => {
        'use server'
        return `Hello, ${subject}!`
      }}
    />
  )
}

const Dynamic = async () => {
  await connection()
  return <h1>Dynamic</h1>
}
