import { SupportFooter } from './support-footer'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <SupportFooter />
      </body>
    </html>
  )
}
