import Link from 'next/link'
import { ReactNode } from 'react'

export default function ForcedSchemeLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div>
      <h1>
        <Link href="/">🏡</Link> Forced Color Scheme
      </h1>
      <p>
        Example page showing <code>forcedColorScheme</code>
      </p>
      {children}
    </div>
  )
}
