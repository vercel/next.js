import { cookies } from 'next/headers'

export const instant = { level: 'experimental-error' }

export default async function Layout({ children, params }) {
  await params // 1 (correct)
  await cookies() // 2 (incorrect)
  return (
    <div>
      <p>This layout is blocked on params.</p>
      {children}
    </div>
  )
}
