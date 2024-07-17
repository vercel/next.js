import { ReactNode } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  console.log('MY LOG MESSAGE')
  console.error('MY ERROR MESSAGE')

  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
