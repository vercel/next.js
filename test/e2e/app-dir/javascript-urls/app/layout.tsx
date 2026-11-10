import Link from 'next/link'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <main>{children}</main>
        <Link href="/app/safe">Safe Page</Link>
      </body>
    </html>
  )
}
