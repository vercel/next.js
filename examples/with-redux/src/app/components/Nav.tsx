'use client'

/* Core */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import cx from 'classnames'

export const Nav = () => {
  const pathname = usePathname()

  return (
    <nav>
      <Link className={cx({ active: pathname === '/' })} href="/">
        Home
      </Link>
      <Link className={cx({ active: pathname === '/verify' })} href="/verify">
        Verify
      </Link>
    </nav>
  )
}
