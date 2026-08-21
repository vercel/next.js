import { Suspense } from 'react'
import { RouterUrl } from './router-url'
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
        <Suspense>
          <RouterUrl />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
