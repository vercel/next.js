import { connection } from 'next/server'

export default async function Layout({ children }) {
  await connection()
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
