'use client'

import { useSelectedLayoutSegments } from 'next/navigation'

export function BreadcrumbTrail() {
  const segments = useSelectedLayoutSegments()
  return (
    <span data-testid="breadcrumb-trail">
      Crumbs: {segments.join(' / ') || '(root)'}
    </span>
  )
}
