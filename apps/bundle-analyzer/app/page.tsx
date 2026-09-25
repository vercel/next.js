import { Suspense } from 'react'
import { SingleAnalyzer } from '@/components/analyzer'

export default function HomePage() {
  return (
    <Suspense>
      <SingleAnalyzer />
    </Suspense>
  )
}
