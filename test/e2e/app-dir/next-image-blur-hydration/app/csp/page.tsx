import { connection } from 'next/server'
import { Suspense } from 'react'
import Images from '../../components/images'

async function DynamicImages() {
  await connection()
  return <Images />
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DynamicImages />
    </Suspense>
  )
}
