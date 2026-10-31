import { ReactNode } from 'react'
import { NoInline } from '../../../components/no-inline'

// This layout renders large content that depends on the route param.
// In a fallback shell render, `await params` causes postponement so
// the segment output is small. In a concrete render the full content
// appears, pushing the segment above the 2KB gzip inlining threshold.
// If hints were incorrectly based on the fallback shell, this layout
// would appear small and get inlined — the test catches that.
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <div>
      <NoInline />
      <p>{`Dynamic layout for: ${slug}`}</p>
      {children}
    </div>
  )
}
