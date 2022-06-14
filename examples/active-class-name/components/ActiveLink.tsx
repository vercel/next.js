import { useRouter } from 'next/router'
import Link, { LinkProps } from 'next/link'
import React, { ReactElement, Children } from 'react'

type ActiveLinkProps = LinkProps & {
  children: ReactElement
  activeClassName: string
}

const ActiveLink = ({
  children,
  activeClassName,
  ...props
}: ActiveLinkProps) => {
  const { asPath } = useRouter()
  const child = Children.only(children)
  const childClassName = child.props.className || ''
  const isActive = asPath === props.href || asPath === props.as

  // pages/index.tsx will be matched via props.href
  // pages/about.tsx will be matched via props.href
  // pages/[slug].tsx will be matched via props.as
  const className = isActive
    ? `${childClassName} ${activeClassName}`.trim()
    : childClassName

  return (
    <Link {...props}>
      {React.cloneElement(child, {
        className: className || null,
      })}
    </Link>
  )
}

export default ActiveLink
