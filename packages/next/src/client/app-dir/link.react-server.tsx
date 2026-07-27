import type { ComponentProps } from 'react'
import ClientLinkComponent, { type LinkProps, useLinkStatus } from './link'

export default function LinkComponent(
  props: ComponentProps<typeof ClientLinkComponent>
) {
  const isLegacyBehavior = props.legacyBehavior
  const childIsHostComponent =
    typeof props.children === 'string' ||
    typeof props.children === 'number' ||
    typeof (props.children as any)?.type === 'string'
  const childIsClientComponent =
    (props.children as any)?.type?.$$typeof ===
    Symbol.for('react.client.reference')

  if (isLegacyBehavior && !childIsHostComponent && !childIsClientComponent) {
    if ((props.children as any)?.type?.$$typeof === Symbol.for('react.lazy')) {
      console.error(
        `Using a Lazy Component as a direct child of \`<Link legacyBehavior>\` from a Server Component is not supported. If you need legacyBehavior, wrap your Lazy Component in a Client Component that renders the Link's \`<a>\` tag.`
      )
    } else {
      console.error(
        `Using a Server Component as a direct child of \`<Link legacyBehavior>\` is not supported. If you need legacyBehavior, wrap your Server Component in a Client Component that renders the Link's \`<a>\` tag.`
      )
    }
  }

  return <ClientLinkComponent {...props} />
}

export { type LinkProps, useLinkStatus }
