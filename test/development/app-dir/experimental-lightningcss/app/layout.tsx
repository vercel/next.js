import '../styles/global1.css'
import '../styles/global2.css'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
