'use client'

import { useSelectedLayoutSegment } from 'next/navigation'

export function ActiveTab() {
  const segment = useSelectedLayoutSegment()
  return <span data-testid="active-tab">{segment}</span>
}
