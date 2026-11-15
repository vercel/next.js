import { connection } from 'next/server'

export default async function Layout({ children }) {
  await connection()
  return (
    <div>
      <p id="loading-boundary-outer-layout">Outer layout [lb-outer-layout]</p>
      {children}
    </div>
  )
}
