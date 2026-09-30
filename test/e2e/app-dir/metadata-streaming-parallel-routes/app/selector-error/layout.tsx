import type { MetadataSelector } from 'next'

export const dynamic = 'force-dynamic'

export const unstable_selectMetadata: MetadataSelector<'slot'> = () => {
  throw new Error('metadata selector error')
}

export default function Layout({ children, slot: _slot }) {
  return children
}
