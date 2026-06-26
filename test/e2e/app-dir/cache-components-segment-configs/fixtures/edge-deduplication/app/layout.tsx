export const dynamic = 'force-dynamic'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
