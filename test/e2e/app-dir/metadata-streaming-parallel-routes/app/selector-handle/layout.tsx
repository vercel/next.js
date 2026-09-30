import type { MetadataSelector, ViewportSelector } from 'next'

export const unstable_selectMetadata: MetadataSelector<'bar' | 'foo'> = ({
  bar,
}) => bar

export const unstable_selectViewport: ViewportSelector<'bar' | 'foo'> = ({
  foo,
}) => foo

export default function Layout({ children, bar, foo }) {
  return (
    <main>
      {children}
      {bar}
      {foo}
    </main>
  )
}
