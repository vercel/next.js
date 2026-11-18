import type { ReactNode } from 'react'
import { getCurrentViewer } from '@/lib/releases'
import { ViewerControls } from './viewer-controls'

export default async function ReleaseLayout({
  children,
}: {
  children: ReactNode
}) {
  const viewer = await getCurrentViewer()

  return (
    <section data-testid="release-shell">
      <header>
        <a href="/">Launch control</a>
        <nav aria-label="Release">
          <a href="#overview">Overview</a>
          <a href="#checks">Checks</a>
        </nav>
        <ViewerControls viewer={viewer} />
      </header>
      {children}
    </section>
  )
}
