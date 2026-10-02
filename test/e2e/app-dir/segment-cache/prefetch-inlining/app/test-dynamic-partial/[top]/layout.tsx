import { Suspense, type ReactNode } from 'react'
import { NoInline } from '../../../components/no-inline'

export function generateStaticParams() {
  return [{ top: 't1' }]
}

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ top: string }>
}) {
  const { top } = await params
  return (
    <div>
      <NoInline />
      <p>{`Top: ${top}`}</p>
      <Suspense fallback={<p>Loading bottom...</p>}>{children}</Suspense>
    </div>
  )
}
