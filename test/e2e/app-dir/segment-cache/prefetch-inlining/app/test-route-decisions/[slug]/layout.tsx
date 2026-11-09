import { ReactNode } from 'react'
import { NoInline } from '../../../components/no-inline'

// The size of this layout depends on the route param: for `large` it is
// above the 2KB gzip inlining threshold, for `small` it is far below it. So
// the two pages of this route would reach different inlining decisions if
// each one measured itself. The decisions are made once per route, by the
// first page in route order (`large`): the layout is outlined on both.
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
      {slug === 'large' ? <NoInline /> : null}
      <p>{`Route decisions layout for: ${slug}`}</p>
      {children}
    </div>
  )
}
