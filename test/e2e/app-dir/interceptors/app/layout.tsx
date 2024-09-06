import { ReactNode } from 'react'
import { createTimeStamp, logWithTime } from './time-utils'
import { setTimeout } from 'timers/promises'

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  await logWithTime('RootLayout', () => setTimeout(0))

  return (
    <html>
      <body>
        <h1 suppressHydrationWarning>Root Layout {createTimeStamp()}</h1>
        {children}
      </body>
    </html>
  )
}
