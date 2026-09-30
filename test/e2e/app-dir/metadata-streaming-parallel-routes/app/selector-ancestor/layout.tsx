import type { MetadataSelector, ViewportSelector } from 'next'

export const unstable_selectMetadata: MetadataSelector<'bar' | 'foo'> = ({
  foo,
}) => foo

export const unstable_selectViewport: ViewportSelector<'bar' | 'foo'> = ({
  foo,
}) => foo

export default function Layout({ children }) {
  return children
}
