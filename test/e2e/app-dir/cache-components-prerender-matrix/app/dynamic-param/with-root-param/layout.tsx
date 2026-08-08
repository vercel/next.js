import { ReactNode } from 'react'

// Root layout for the dynamic-param/with-root-param TOMBSTONE. Note the
// placement: this root layout sits ABOVE the catch-all segment, so the
// segment params are NOT root params — which is exactly why this route can
// build while the combination it documents cannot: a real
// with-root-param branch would put the root layout inside [lang], and root
// params must be provided by generateStaticParams, which the dynamic-param
// matrix doesn't have.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
