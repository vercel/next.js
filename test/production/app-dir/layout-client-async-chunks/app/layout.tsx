import { loadData } from '../lib/data'

export default function Layout({ children }: { children: React.ReactNode }) {
  // No static analytics import: the reference is behind a server import().
  loadData()
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
