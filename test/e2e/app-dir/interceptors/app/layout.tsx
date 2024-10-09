import { ReactNode } from 'react'
import { createTimeStamp, logWithTime } from './time-utils'

export default async function RootLayout({
  children,
  slot,
}: {
  children: ReactNode
  slot: React.ReactNode
}) {
  await logWithTime('RootLayout', () => Promise.resolve())

  return (
    <html>
      <body>
        <h1 suppressHydrationWarning>Root Layout {createTimeStamp()}</h1>
        {children}
        {slot}
      </body>
    </html>
  )
}
