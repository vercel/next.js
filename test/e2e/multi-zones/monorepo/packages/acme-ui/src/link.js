import NextLink from 'next/link'

const Link = ({ children, ...props }) => (
  <NextLink {...props}>{children}</NextLink>
)

export default Link
