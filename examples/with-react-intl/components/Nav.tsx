import Link from "next/link";
import { useRouter } from "next/router";
import { FormattedMessage } from "react-intl";
import styles from "./Nav.module.css";

export default function Nav() {
  const { locale, locales, asPath } = useRouter();
  return (
    <nav className={styles.nav}>
      <li className={styles.li}>
        <Link href="/">
          <FormattedMessage
            defaultMessage="Home"
            description="Nav: Index name"
          />
        </Link>
      </li>
      <li className={styles.li}>
        <Link href="/about">
          <FormattedMessage
            defaultMessage="About"
            description="Nav: About item"
          />
        </Link>
      </li>

      <li className={styles.divider}></li>

      {locales?.map((availableLocale) => (
        <li key={availableLocale} className={styles.li}>
          <Link
            href={asPath}
            locale={availableLocale}
            prefetch={false}
            className={availableLocale === locale ? styles.active : undefined}
          >
            {availableLocale}
          </Link>
        </li>
      ))}
    </nav>
  );
}
