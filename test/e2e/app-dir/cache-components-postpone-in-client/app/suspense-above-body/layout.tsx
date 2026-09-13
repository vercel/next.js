import { Suspense } from 'react'

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <Suspense>
      <html>
        <body>
          <p>This root layout has a Suspense above the body.</p>
          <hr />
          {children}
        </body>
      </html>
    </Suspense>
  )
}
