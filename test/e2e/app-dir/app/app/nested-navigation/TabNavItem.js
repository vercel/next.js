import Link from 'next/link'

export const TabNavItem = ({ children, href }) => {
  return (
    <Link href={href}>
      <a style={{ margin: '10px', display: 'block' }}>{children}</a>
    </Link>
  )
}
