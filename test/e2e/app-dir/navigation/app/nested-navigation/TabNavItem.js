import Link from 'next/link'

export const TabNavItem = ({ children, href, prefetch }) => {
  return (
    <Link
      href={href}
      style={{ margin: '10px', display: 'block' }}
      prefetch={prefetch}
    >
      {children}
    </Link>
  )
}
