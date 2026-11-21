import type { ReactNode } from 'react'
import SectionHeader from '../section-header'

export default function SectionLayout({ children }: { children: ReactNode }) {
  return (
    <main>
      <SectionHeader />
      {children}
    </main>
  )
}
