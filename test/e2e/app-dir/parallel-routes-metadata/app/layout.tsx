import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Layout Title',
    template: '%s | My App',
  },
}

export default function RootLayout({
  parallel,
}: {
  parallel: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div id="parallel-slot">{parallel}</div>
      </body>
    </html>
  )
}
