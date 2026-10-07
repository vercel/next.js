import { HydrationProbe } from './hydration-probe'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <HydrationProbe />
        {children}
      </body>
    </html>
  )
}
