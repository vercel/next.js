'use client'

/* Core */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import cx from 'classnames'

/* Instruments */
import styles from '../styles/layout.module.css'

export const Nav = () => {
  const pathname = usePathname()

  return (
    <nav className={styles.nav}>
      <Link
        className={cx(styles.link, { [styles.active]: pathname === '/' })}
        href="/"
      >
        Home
      </Link>
      <Link
        className={cx(styles.link, {
          [styles.active]: pathname === '/verify',
        })}
        href="/verify"
      >
        Verify
      </Link>
    </nav>
  )
}
