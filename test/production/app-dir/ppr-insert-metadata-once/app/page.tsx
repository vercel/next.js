import { connection } from 'next/server'
import { Suspense } from 'react'

export default function Page() {
  return (
    <div className="container">
      <Suspense>
        <SuspendedComponent />
      </Suspense>
    </div>
  )
}

async function SuspendedComponent() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 500))
  return <div>suspended component</div>
}

export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 2 * 1000))
  return {
    title: `fully dynamic`,
    description: `fully dynamic - ${Math.random()}`,
  }
}
