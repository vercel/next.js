"use client";

import Link from "next/link";
import { useUser } from "@auth0/nextjs-auth0/client";
import styles from "./header.module.css";

export function Header() {
  const { user, isLoading } = useUser();

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        <ul className={styles.ul}>
          <li className={styles.li}>
            <Link href="/">Home</Link>
          </li>
          <li className={styles.li}>
            <Link href="/about">About</Link>
          </li>
          <li className={`${styles.li} ${styles.liSpacer}`}>
            <Link href="/advanced/api-profile">
              API rendered profile (advanced)
            </Link>
          </li>
          {!isLoading &&
            (user ? (
              <>
                <li className={styles.li}>
                  <Link href="/profile">Client rendered profile</Link>
                </li>
                <li className={styles.li}>
                  <Link href="/advanced/ssr-profile">
                    Server rendered profile (advanced)
                  </Link>
                </li>
                <li className={styles.li}>
                  <a href="/api/auth/logout">Logout</a>
                </li>
              </>
            ) : (
              <li className={styles.li}>
                <a href="/api/auth/login">Login</a>
              </li>
            ))}
        </ul>
      </nav>
    </header>
  );
}
