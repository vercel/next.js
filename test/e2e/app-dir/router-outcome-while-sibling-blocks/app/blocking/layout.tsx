import type { ReactNode } from 'react'
import { Slow } from '../slow'

// Slow sits in its own element after the page, so the page renders (and
// redirects) before Slow suspends. Nothing above catches the suspension.
export default function BlockingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div>
        <Slow />
      </div>
    </>
  )
}
