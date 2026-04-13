import { RouterAct } from '@next/router-act/component'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <RouterAct />
      </body>
    </html>
  )
}
