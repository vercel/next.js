'use client'

import { usePathname } from 'next/navigation'
import { useSelectedLayoutSegment } from 'next/navigation'
import { useSelectedLayoutSegments } from 'next/navigation'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname({ ssr: false })
  const segment = useSelectedLayoutSegment(undefined, { ssr: false })
  const segments = useSelectedLayoutSegments(undefined, { ssr: false })

  return (
    <html>
      <body>
        <nav>
          <span id="pathname">{pathname ?? 'null'}</span>
          <span id="segment">{segment ?? 'null'}</span>
          <span id="segments">
            {segments ? JSON.stringify(segments) : 'null'}
          </span>
        </nav>
        {children}
      </body>
    </html>
  )
}
