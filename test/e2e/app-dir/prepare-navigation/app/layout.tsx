import type { ReactNode } from 'react'
import { PrepareControls } from '../components/prepare-controls'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        {/* Rendered in the root layout so that a prepared navigation survives
            navigations to other pages before it's committed. */}
        <PrepareControls
          hrefs={[
            '/target',
            '/target#target-shell',
            '/static-target',
            '/static-target#static-target',
            '/static-param/b',
            '/redirect-target',
            '/hub-b',
          ]}
        />
        {children}
      </body>
    </html>
  )
}
