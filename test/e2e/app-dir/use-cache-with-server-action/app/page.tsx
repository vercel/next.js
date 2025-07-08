import { connection } from 'next/server'
import { Suspense } from 'react'

export default function Page() {
  return (
    <div>
      <Suspense fallback={<h1>Loading...</h1>}>
        <Dynamic />
      </Suspense>
      <GreetingForm subject="World" />
    </div>
  )
}

async function GreetingForm({ subject }: { subject: string }) {
  'use cache'

  return (
    <form
      action={async () => {
        'use server'
        console.log(`Hello, ${subject}!`)
      }}
    >
      <button id="submit-button-arrow">Say Hello</button>{' '}
      <button
        id="submit-button-fn"
        formAction={async function hi() {
          'use server'
          console.log(`Hi, ${subject}!`)
        }}
      >
        Say Hi
      </button>
    </form>
  )
}

const Dynamic = async () => {
  await connection()
  return <h1>Dynamic</h1>
}
