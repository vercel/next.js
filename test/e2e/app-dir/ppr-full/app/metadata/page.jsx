import { Suspense } from 'react'
import { Dynamic } from '../../components/dynamic'
import { unstable_noStore } from 'next/cache'

export const revalidate = 60

export async function generateMetadata() {
  unstable_noStore()

  return {
    title: 'Metadata',
    description: 'This is the metadata page.',
  }
}

export default function MetadataPage() {
  return (
    <Suspense fallback={<Dynamic pathname="/metadata" fallback />}>
      <Dynamic pathname="/metadata" />
    </Suspense>
  )
}
