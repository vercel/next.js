import Link from 'next/link'
import { useRouter } from 'next/router'
import { FormattedMessage } from 'react-intl'
import styles from './Nav.module.css'

export default function Nav() {
  const { locale, locales, asPath } = useRouter()
  return (
    <nav className={styles.nav}>
      <li className={styles.li}>
        <Link href="/" passHref>
          <a>
            <FormattedMessage
              defaultMessage="Home"
              description="Nav: Index name"
            />
          </a>
        </Link>
      </li>
      <li className={styles.li}>
        <Link href="/about" passHref>
          <a>
            <FormattedMessage
              defaultMessage="About"
              description="Nav: About item"
            />
          </a>
        </Link>
      </li>

      <li className={styles.divider}></li>

      {locales.map((availableLocale) => (
        <li key={availableLocale} className={styles.li}>
          <Link
            href={asPath}
            locale={availableLocale}
            passHref
            prefetch={false}
          >
            <a
              className={availableLocale === locale ? styles.active : undefined}
            >
              {availableLocale}
            </a>
          </Link>
        </li>
      ))}
    </nav>
  )
}
