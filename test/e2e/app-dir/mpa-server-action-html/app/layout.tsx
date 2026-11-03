import type { ReactNode } from 'react'
import { readValue } from './read-value'

export default async function Root({ children }: { children: ReactNode }) {
  const value = await readValue('layout')
  return (
    <html>
      <body>
        <header id="static-shell">MPA action page</header>
        <p id="layout-value">{value}</p>
        {children}
      </body>
    </html>
  )
}
