import Link from 'next/link'
import { FAMILIES, familyHref } from './families'

// Root layout: the static shell plus a persistent nav with one link per family
// (client / server / sprite). Each link targets the family's deeply-nested leaf
// route. The `<Link>`s are what the benchmark's Playwright driver clicks to
// produce real soft navigations. Clicking a family's link repeatedly re-renders
// and re-validates that route, each click triggering a dev Cache Components
// validation.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <nav>
          {FAMILIES.map((family) => (
            <Link key={family} href={familyHref(family)} data-nav={family}>
              {family}
            </Link>
          ))}
        </nav>
        {children}
      </body>
    </html>
  )
}
