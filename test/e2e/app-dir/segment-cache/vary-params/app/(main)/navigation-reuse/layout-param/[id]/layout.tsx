import { connection } from 'next/server'

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  // Dynamic, but never reads params.
  await connection()
  return (
    <>
      <p id="layout-token">{`Layout token: ${Math.random()}`}</p>
      {children}
    </>
  )
}
