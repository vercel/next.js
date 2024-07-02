import { ReactNode } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export const metadata = [
  {
    title: 'hello world',
    description: 'returned as an array',
  },
]
