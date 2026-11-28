import type { ReactNode } from 'react'
import { InsertedHTMLRegistry } from './inserted-html-registry'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <InsertedHTMLRegistry>{children}</InsertedHTMLRegistry>
      </body>
    </html>
  )
}
