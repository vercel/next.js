import type { ReactNode } from 'react'
import { draftMode } from 'next/headers'

export default async function Layout({ children }: { children: ReactNode }) {
  const { isEnabled } = await draftMode()

  return (
    <>
      <div id="draft-mode">{String(isEnabled)}</div>
      {children}
    </>
  )
}
