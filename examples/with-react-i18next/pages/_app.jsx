import Link from 'next/link'

import '../translations/i18n'
import { TranslateButtons } from '../translations/TranslateButtons'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <TranslateButtons />

      <ul>
        <li>
          <Link href="/">
            <a>Home</a>
          </Link>
        </li>
        <li>
          <Link href="/overview">
            <a>Namespace example</a>
          </Link>
        </li>
      </ul>

      <Component {...pageProps} />
    </>
  )
}

export default MyApp
