import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export default function Page() {
  return (
    <div>
      <h1>Fully Dynamic</h1>
      <Suspense>
        <DynamicContent />
      </Suspense>
    </div>
  )
}

async function DynamicContent() {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('test')
  return <div>Cookie: {cookie?.value}</div>
}

export async function generateMetadata() {
  await connection()
  return {
    title: 'fully dynamic',
    description: `fully dynamic - ${Math.random()}`,
  }
}
