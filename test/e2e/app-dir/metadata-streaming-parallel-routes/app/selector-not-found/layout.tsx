import type { MetadataSelector, ViewportSelector } from 'next'

export const unstable_selectMetadata: MetadataSelector<'bar' | 'foo'> = async ({
  bar,
  foo,
}) => {
  const selected = await foo
  return selected.status === 'not-found' ? bar : foo
}

export const unstable_selectViewport: ViewportSelector<'bar' | 'foo'> = async ({
  bar,
  foo,
}) => {
  const selected = await foo
  return selected.status === 'not-found' ? bar : foo
}

export default function Layout({ children, bar, foo: _foo }) {
  return (
    <main>
      {children}
      {bar}
    </main>
  )
}
