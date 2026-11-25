import { ReactNode } from 'react'

// Root layout for the demo index page. Every matrix branch hosts its own
// root layout (the with-root-param branches place theirs inside [lang]), so
// the index needs one of its own via this route group.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
