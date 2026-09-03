import type { MetadataSelector, ViewportSelector } from 'next'
import type { ReactNode } from 'react'

export const unstable_selectMetadata: MetadataSelector<never> = ({
  children,
}) => children

export function unstable_selectViewport({
  children,
}: Parameters<ViewportSelector>[0]) {
  return children
}

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
