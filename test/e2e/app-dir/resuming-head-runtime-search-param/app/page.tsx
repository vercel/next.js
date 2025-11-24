import { connection } from 'next/server'
import { Suspense } from 'react'

export default function Page() {
  return (
    <p>
      hello world
      <Suspense>
        <DynamicHole />
      </Suspense>
    </p>
  )
}

export const generateMetadata = async () => {
  await connection()
  return {
    title: `Hello World`,
  }
}

const DynamicHole = async () => {
  await connection()
  return <p>Dynamic Hole</p>
}
