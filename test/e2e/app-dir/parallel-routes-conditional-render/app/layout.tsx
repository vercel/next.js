import { ReactNode } from 'react'

export default function Root({
  children,
  auth,
}: {
  children: ReactNode
  auth: ReactNode
}) {
  const isLoggedIn = false

  return (
    <html>
      <body>{isLoggedIn ? children : auth}</body>
    </html>
  )
}
