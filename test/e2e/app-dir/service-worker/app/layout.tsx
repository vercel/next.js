import { RegisterServiceWorker } from './register-service-worker'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  )
}
