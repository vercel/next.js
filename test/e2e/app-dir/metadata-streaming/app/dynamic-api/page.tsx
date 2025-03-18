import { cookies } from 'next/headers'
import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
export default function Home() {
  return (
    <div>
      <h1>Hello World</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <SubComponent />
      </Suspense>
      <Link href="/">Home</Link>
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
  await new Promise((resolve) => setTimeout(resolve, 800))
  return {
    title: `Dynamic api ${Math.random()}`,
  }
}
