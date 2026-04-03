import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Only Parallel',
}

export default function ParallelNoChildrenMetaPage() {
  return <p id="parallel-no-children-meta-content">Only Parallel Content</p>
}
