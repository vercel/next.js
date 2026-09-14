import { ReactNode } from 'react'
// Layout imports the global stylesheet — this is the typical Next.js
// pattern where `globals.css` is imported by the root layout and so
// applies to every app-page route (not just one). The tool must pick up
// CSS from the layout segment via `entryCSSFiles[<layout>]` for all
// app-pages, not just the one that directly imports `globals.css`.
import './globals.css'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
