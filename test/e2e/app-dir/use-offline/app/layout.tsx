import { OfflineStatus } from '../components/offline-status'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <OfflineStatus />
        {children}
      </body>
    </html>
  )
}
