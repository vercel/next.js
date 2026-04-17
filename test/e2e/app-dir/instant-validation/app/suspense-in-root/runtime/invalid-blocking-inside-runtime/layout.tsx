import { cookies } from 'next/headers'

export const unstable_instant = true
export const unstable_prefetch = 'force-runtime'

export default async function RuntimeLayout({ children }) {
  await cookies()
  return (
    <div>
      <p>The layout does not wrap children with Suspense.</p>
      <hr />
      {children}
    </div>
  )
}
