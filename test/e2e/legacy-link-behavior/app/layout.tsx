import { connection } from 'next/server'

export default async function Root({
  children,
}: {
  children: React.ReactNode
}) {
  await connection()

  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
