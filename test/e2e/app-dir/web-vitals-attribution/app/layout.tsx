import { ReactNode } from 'react'
import { WebVitalsReporter } from './web-vitals-reporter'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <WebVitalsReporter />
        {children}
      </body>
    </html>
  )
}
