import '../styles/global.css'
import { Abel } from 'next/font/google'

const abel = Abel({ weight: '400', display: 'optional', preload: false })

export default function App({ Component, pageProps }) {
  return (
    <main className={abel.className}>
      <Component {...pageProps} />
    </main>
  )
}
