import { loadData } from '../lib/data'
import { track } from '../lib/analytics'

export default function Layout({ children }: { children: React.ReactNode }) {
  loadData()
  return (
    <html>
      <body data-analytics={typeof track}>{children}</body>
    </html>
  )
}
