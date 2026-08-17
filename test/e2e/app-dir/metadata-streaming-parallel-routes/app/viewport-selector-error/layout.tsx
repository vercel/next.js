import type { ViewportSelector } from 'next'

export const dynamic = 'force-dynamic'

export const unstable_selectViewport: ViewportSelector<'slot'> = () => {
  throw new Error('viewport selector error')
}

export default function Layout({ children, slot: _slot }) {
  return children
}
