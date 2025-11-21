import '../global.css'
import { Inter } from 'next/font/google'

const interFont = Inter({
  subsets: ['latin'],
})

export default function App({ Component, pageProps }) {
  return (
    <div className={interFont.className}>
      <Component {...pageProps} />
    </div>
  )
}
