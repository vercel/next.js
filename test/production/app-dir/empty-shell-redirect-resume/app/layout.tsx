import { ReactNode } from 'react'
import { cookies } from 'next/headers'

export const instant = false

async function LayoutContent({ children }: { children: ReactNode }) {
  await cookies()
  return children
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <LayoutContent>{children}</LayoutContent>
      </body>
    </html>
  )
}
