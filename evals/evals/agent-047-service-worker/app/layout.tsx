import { SwRegistrar } from './sw-registrar'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <SwRegistrar />
        {children}
      </body>
    </html>
  )
}
