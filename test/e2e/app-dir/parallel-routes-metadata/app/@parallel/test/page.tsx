import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Parallel Test',
}

export default function ParallelTestPage() {
  return <p id="parallel-test-content">Parallel Test Content</p>
}
