import type { ComponentProps } from 'react'
import ClientLinkComponent, { type LinkProps, useLinkStatus } from './link'

export default function LinkComponent(
  props: ComponentProps<typeof ClientLinkComponent>
) {
  // console.log('this is an RSC')

  const isLegacyBehavior = props.legacyBehavior
  // @ts-ignore
  const childIsString = typeof props.children?.type === 'string'
  const childIsClientComponent =
    // @ts-ignore
    props.children?.type?.$$typeof === Symbol.for('react.client.reference')

  // console.log({ isLegacyBehavior })
  // console.log({ childIsString })
  // console.log({ childIsClientComponent })
  if (isLegacyBehavior && !childIsString && !childIsClientComponent) {
    console.error(
      `Using a Server Component as a direct child of \`<Link legacyBehavior>\` is not supported. If you need legacyBehavior, wrap your Server Component in a Client Component that renders the Link's \`<a>\` tag.`
    )
  }

  return <ClientLinkComponent {...props} />
}

export { type LinkProps, useLinkStatus }
