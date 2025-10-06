import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export default function Home() {
  return (
    <div>
      <h1>Fully Dynamic</h1>
      <Suspense>
        <SubComponent />
      </Suspense>
    </div>
  )
}

async function SubComponent() {
  const cookieStore = await cookies()
  await new Promise((resolve) => setTimeout(resolve, 500))
  const cookie = await cookieStore.get('test')
  return <div>Cookie: {cookie?.value}</div>
}

export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 2 * 1000))
  return {
    title: `fully dynamic`,
    description: `fully dynamic - ${Math.random()}`,
  }
}
