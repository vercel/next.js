import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export function generateStaticParams() {
  // the param values are not accessed in tests,
  // we just need a value here to avoid errors in PPR/cacheComponents
  // where we need to provide at least one set of values for root params
  return [{ lang: 'foo', locale: 'bar' }]
}
