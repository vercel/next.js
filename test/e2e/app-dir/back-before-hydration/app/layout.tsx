import { ThirdPartyPush } from './third-party-push'
import { CommitProbe } from './commit-probe'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: 'window.__BBH_DEBUG = true' }}
        />
      </head>
      <body>
        <ThirdPartyPush />
        <CommitProbe />
        {children}
      </body>
    </html>
  )
}
