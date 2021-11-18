import NextLink, { LinkProps } from 'next/link'

const Link: React.FC<LinkProps> = ({ children, href, ...rest }) => {
  const isExternal: boolean = String(href).startsWith('http')

  if (isExternal) {
    return (
      <a href={String(href)} className="text-blue-900 hover:text-blue-700">
        {children}
      </a>
    )
  }
  return (
    <NextLink href={href} {...rest}>
      <a className="text-blue-900 hover:text-blue-700">{children}</a>
    </NextLink>
  )
}

export default Link
