import { Inter } from 'next/font/google'
import styles from './page.module.css'
import ColorSchemePreference from './ColorSchemePreference'
import DarkThemeSelector from './DarkThemeSelector'
import ThemeSelector from './ThemeSelector'
import LightThemeSelector from './LightThemeSelector'
import PageNavigator from './pageNavigator'
import Image from 'next/image'

const inter = Inter({ subsets: ['latin'] })

export default function Home() {
  return (
    <main className={`${styles.main} ${inter.className}`}>
      <div className={styles.description}>
        <p>
          Get started by editing&nbsp;
          <code className={styles.code}>app/page.tsx</code>
        </p>
        <div>
          <a
            href="https://mayank-chaudhari.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
          >
            By Mayank
          </a>
        </div>
      </div>

      <div className={styles.center}>
        <div>
          <h1>
            Theme with <code>nextjs-themes</code>
          </h1>
          <p>Unleash the power of React Server Components!</p>
        </div>
      </div>

      <div className={styles.center}>
        <ColorSchemePreference />
        <ThemeSelector />
        <DarkThemeSelector />
        <LightThemeSelector />
      </div>

      <div className={styles.cards}>
        <PageNavigator />

        <a
          href="https://github.com/mayank1513/nextjs-themes"
          className={styles.card}
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2>
            More Examples <span>-&gt;</span>
          </h2>
          <p>Explore more examples on official GitHub Repo.</p>
        </a>
        <a
          href="https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/app-dir-nextjs-themes&project-name=app-dir-nextjs-themes&repository-name=app-dir-nextjs-themes"
          className={styles.card}
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2>
            Deploy with{' '}
            <Image
              src="/vercel.svg"
              alt="Vercel Logo"
              className={styles.vercelLogo}
              width={87.5}
              height={21}
              priority
            />{' '}
            <span>-&gt;</span>
          </h2>
          <p>Instantly deploy this example with Vercel.</p>
        </a>
      </div>
    </main>
  )
}
