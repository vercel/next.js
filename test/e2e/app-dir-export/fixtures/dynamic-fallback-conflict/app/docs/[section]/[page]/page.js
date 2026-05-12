import { Suspense } from 'react'
import DocsSectionPageClient from './params-client'

export function generateStaticParams() {
  return [{ section: 'api', page: 'reference' }]
}

export default function DocsSectionPage() {
  return (
    <main>
      <Suspense fallback={<h1>Loading docs section page...</h1>}>
        <DocsSectionPageClient />
      </Suspense>
    </main>
  )
}
