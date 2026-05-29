import { Suspense } from 'react'
import { Dynamic } from '../../components/dynamic'
import { unstable_noStore } from 'next/cache'

export const revalidate = 120

export async function generateMetadata() {
  unstable_noStore()

  return { title: 'Metadata' }
}

export default function MetadataPage() {
  return (
    <Suspense fallback={<Dynamic pathname="/metadata" fallback />}>
      <Dynamic pathname="/metadata" />
    </Suspense>
  )
}
