import { Suspense } from 'react'

export default async function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html>
      <body>
        <p>This root layout has a Suspense inside the body.</p>
        <hr />
        <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
      </body>
    </html>
  )
}
