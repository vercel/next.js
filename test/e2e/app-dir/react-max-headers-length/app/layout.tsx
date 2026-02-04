import { ReactNode } from 'react'
import { preload } from 'react-dom'

export default function Root({ children }: { children: ReactNode }) {
  // Each of these preloads will emit a link header that will consist of about
  // 105 characters.
  for (let i = 0; i < 100; i++) {
    preload(
      '/?q=some+string+that+spans+lots+of+characters&i=' +
        String(i).padStart(2, '0'),
      {
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      }
    )
  }
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
