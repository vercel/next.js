import type { ComponentProps } from 'react'
import ClientLinkComponent, { type LinkProps, useLinkStatus } from './link'

export default function LinkComponent(
  props: ComponentProps<typeof ClientLinkComponent>
) {
  console.log('this is an RSC')
  // console.log(props.children)

  const isLegacyBehavior = props.legacyBehavior
  // @ts-ignore
  const childIsString = typeof props.children?.type === 'string'
  const childIsClientComponent =
    // @ts-ignore
    props.children?.type?.$$typeof === Symbol.for('react.client.reference')

  if (isLegacyBehavior && !childIsString && !childIsClientComponent) {
    console.error(
      `You've passed a lazy element to the link. In a Next.js app this is often because you are passing a Server Component as a direct child of Link. This is not supported if you're using legacyMode. Remove legacyMode, or make the direct child of Link a client component.`
    )
  }

  return <ClientLinkComponent {...props} />
}

export { type LinkProps, useLinkStatus }
