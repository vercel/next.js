import { Suspense } from 'react'
import { RouterUrl } from './router-url'
import { ServerPathname } from './server-pathname'
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
        <ServerPathname />
        {children}
      </body>
    </html>
  )
}
