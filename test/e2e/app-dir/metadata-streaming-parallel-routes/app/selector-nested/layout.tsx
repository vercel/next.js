import type { MetadataSelector, ViewportSelector } from 'next'

export const unstable_selectMetadata: MetadataSelector<
  'outerA' | 'outerB'
> = async ({ outerA, outerB }) => {
  const selected = await outerA
  return selected.status === 'resolved' ? selected : outerB
}

export const unstable_selectViewport: ViewportSelector<
  'outerA' | 'outerB'
> = async ({ outerA, outerB }) => {
  const selected = await outerA
  return selected.status === 'resolved' ? selected : outerB
}

export default function Layout({ children, outerA, outerB }) {
  return (
    <main>
      {children}
      {outerA}
      {outerB}
    </main>
  )
}
