import { Suspense } from 'react'
import { ThirdPartyPush } from './third-party-push'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <ThirdPartyPush />
        <Suspense>{children}</Suspense>
      </body>
    </html>
  )
}
