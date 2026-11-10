import { track } from '../lib/analytics'

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { AsyncOnly } = await import('../lib/intermediate')
  return (
    <html>
      <body data-analytics={typeof track}>
        <AsyncOnly />
        {children}
      </body>
    </html>
  )
}
