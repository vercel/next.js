import { Layout } from '#/ui/page-directory/layout'
import { Inter } from 'next/font/google'
import { AppProps } from 'next/app'
import 'styles/globals.css'

// Using next/font instead of a manual setup, we get:
// - significantly easier setup
// - automatic best font practices
// - reduced layout shift
// - no network requests from the browser
const primaryFont = Inter({
  subsets: ['latin'],
  variable: '--primary-font',
})

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className={`${primaryFont.variable} font-sans`}>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </main>
  )
}
