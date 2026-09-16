import type { ReactNode } from 'react'
import './style.css'

export const metadata = { title: 'Fieldwork — Objects for everyday adventures' }

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
