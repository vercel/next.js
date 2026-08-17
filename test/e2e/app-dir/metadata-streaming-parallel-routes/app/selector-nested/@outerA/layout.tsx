import type { MetadataSelector, ViewportSelector } from 'next'

export const unstable_selectMetadata: MetadataSelector<'inner'> = async ({
  children,
  inner,
}) => {
  const selected = await inner
  if (selected.status !== 'resolved' || selected.value === undefined) {
    return children
  }

  return {
    ...selected.value,
    title: 'nested selected title',
  }
}

export const unstable_selectViewport: ViewportSelector<'inner'> = async ({
  children,
  inner,
}) => {
  const selected = await inner
  if (selected.status !== 'resolved' || selected.value === undefined) {
    return children
  }

  return {
    ...selected.value,
    colorScheme: 'dark',
  }
}

export default function Layout({ children, inner }) {
  return (
    <section>
      {children}
      {inner}
    </section>
  )
}
