import { signin, signout, useSession } from 'next-auth/client'
import styles from './nav.module.css'

/**
 * The approach used in this component shows how to built a sign in and sign out
 * component that works on pages which support both client and server side
 * rendering, and avoids any flash incorrect content on initial page load.
 **/
const Nav = () => {
  const [session, loading] = useSession()

  return (
    <nav>
      <noscript>
        <style>{`.nojs-show { opacity: 1; top: 0; }`}</style>
      </noscript>
      <p
        className={`nojs-show ${
          !session && loading ? styles.loading : styles.loaded
        }`}
      >
        {!session && (
          <>
            <span className={styles.notSignedIn}>Not signed in</span>
            <a
              href={`/api/auth/signin`}
              onClick={(e) => {
                e.preventDefault()
                signin()
              }}
            >
              <button className={styles.signinButton}>Sign in</button>
            </a>
          </>
        )}
        {session && (
          <>
            <span
              style={{ backgroundImage: `url(${session.user.image})` }}
              className={styles.avatar}
            />
            <span className={styles.signedIn}>
              Signed in as <strong>{session.user.email}</strong>
            </span>
            <a
              href={`/api/auth/signout`}
              onClick={(e) => {
                e.preventDefault()
                signout()
              }}
            >
              <button className={styles.signoutButton}>Sign out</button>
            </a>
          </>
        )}
      </p>
    </nav>
  )
}

export default Nav
