import { ThirdPartyPush } from './third-party-push'
import { CommitProbe } from './commit-probe'
import { SlowHydration } from './slow-hydration'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__BBH_DEBUG = true; window.__BBH_STALL = ${Number(process.env.BBH_STALL ?? 0)}`,
          }}
        />
      </head>
      <body>
        <SlowHydration />
        <ThirdPartyPush />
        <CommitProbe />
        {children}
      </body>
    </html>
  )
}
