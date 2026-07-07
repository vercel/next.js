import { ReactNode } from 'react'
import { LinkAccordion } from './link-accordion'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <nav>
          {/* The destination opts into `prefetch = 'allow-runtime'` and the
              link opts into `prefetch={true}`, the standard pairing for
              prefetching request data beyond the App Shell. */}
          <LinkAccordion
            href="/courses?sort=featured"
            prefetch={true}
            id="courses-link"
          >
            Courses
          </LinkAccordion>
        </nav>
        {children}
      </body>
    </html>
  )
}
