import type { MetadataSelector, ViewportSelector } from 'next'

export const unstable_selectMetadata: MetadataSelector<'bar' | 'foo'> = async ({
  bar,
  foo,
}) => {
  const selected = await foo
  if (selected.status !== 'resolved' || selected.value === undefined) {
    return bar
  }

  return {
    ...selected.value,
    title: 'rewritten foo title',
  }
}

export const unstable_selectViewport: ViewportSelector<'bar' | 'foo'> = async ({
  bar,
  foo,
}) => {
  const selected = await foo
  if (selected.status !== 'resolved' || selected.value === undefined) {
    return bar
  }

  return {
    ...selected.value,
    colorScheme: 'dark',
  }
}

export default function Layout({ children, bar, foo }) {
  return (
    <main>
      {children}
      {bar}
      {foo}
    </main>
  )
}
