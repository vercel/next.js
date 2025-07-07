import { connection } from 'next/server'
import { Suspense } from 'react'

export default function Page() {
  return (
    <div>
      <GreetingForm subject="World" />
      <Suspense fallback={<h1>Loading...</h1>}>
        <Dynamic />
      </Suspense>
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
      <button id="submit-button">Log</button>
    </form>
  )
}

const Dynamic = async () => {
  await connection()
  return <h1>Dynamic</h1>
}
