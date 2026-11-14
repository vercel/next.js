import OriginalLink from 'next/link'
import type { ComponentProps } from 'react'

export function TaggedLink(props: ComponentProps<typeof OriginalLink>) {
  const prefetchAttr = `${props.prefetch ?? 'auto'}`
  return (
    <OriginalLink data-type="client" data-prefetch={prefetchAttr} {...props} />
  )
}
