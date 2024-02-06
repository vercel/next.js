'use client'

import { useSelectedLayoutSegment } from 'next/navigation'
import Link from 'next/link'

export default function RootLayout({
  children,
  auth,
  nav,
}: Readonly<{
  children: React.ReactNode
  auth: React.ReactNode
  nav: React.ReactNode
}>) {
  const authSegment = useSelectedLayoutSegment('auth')
  const navSegment = useSelectedLayoutSegment('nav')
  const routeSegment = useSelectedLayoutSegment()

  return (
    <html lang="en">
      <body>
        <section>
          <nav>
            <Link href="/">Main</Link>
            <Link href="/foo">Foo (regular page)</Link>
            <Link href="/login">
              Login (/app/@auth/login) and (/app/@nav/login)
            </Link>
            <Link href="/reset">Reset (/app/@auth/reset)</Link>
            <Link href="/reset/withEmail">
              Reset with Email (/app/@auth/reset/withEmail)
            </Link>
            <Link href="/reset/withMobile">
              Reset with Mobile (/app/@auth/reset/withMobile)
            </Link>
          </nav>
          <div>
            navSegment (parallel route): <div id="navSegment">{navSegment}</div>
          </div>
          <div>
            authSegment (parallel route):{' '}
            <div id="authSegment">{authSegment}</div>
          </div>
          <div>
            routeSegment (app route):{' '}
            <div id="routeSegment">{routeSegment}</div>
          </div>

          <section id="navSlot">{nav}</section>
          <section id="authSlot">{auth}</section>
          <section id="children">{children}</section>
        </section>
      </body>
    </html>
  )
}
