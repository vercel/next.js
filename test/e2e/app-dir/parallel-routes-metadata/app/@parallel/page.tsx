import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Parallel Page',
}

export default function ParallelPage() {
  return <p id="parallel-content">Parallel Slot Content</p>
}
