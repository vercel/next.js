import { ThirdPartyPush } from './third-party-push'
import { CommitProbe } from './commit-probe'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <ThirdPartyPush />
        <CommitProbe />
        {children}
      </body>
    </html>
  )
}
