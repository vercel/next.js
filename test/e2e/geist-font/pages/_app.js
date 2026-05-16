import { GeistSans } from 'geist/font/sans'

export default function MyApp({ Component, pageProps }) {
  return (
    <main className={GeistSans.className}>
      <Component {...pageProps} />
    </main>
  )
}
