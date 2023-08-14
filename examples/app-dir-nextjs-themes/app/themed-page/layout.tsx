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
        <Link href="/">🏡</Link> Forced Theme
      </h1>
      <p>
        Example page showing Themed page with <code>forcedTheme</code>
      </p>
      {children}
    </div>
  )
}
