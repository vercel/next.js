import { Suspense } from 'react'
import SharedComponent from '../shared'

export default async function RewriteLayout({
  children,
  params,
}: {
  params: Promise<Record<string, string>>
  children: React.ReactNode
}) {
  const current = await params

  return (
    <div>
      <pre>{JSON.stringify(current)}</pre>
      <SharedComponent layout={`/rewrite`} />
      <Suspense>{children}</Suspense>
    </div>
  )
}
