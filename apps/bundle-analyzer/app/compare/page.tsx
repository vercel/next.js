import { Suspense } from 'react'
import { CompareAnalyzer } from '@/components/analyzer'

export default function ComparePage() {
  return (
    <Suspense>
      <CompareAnalyzer />
    </Suspense>
  )
}
