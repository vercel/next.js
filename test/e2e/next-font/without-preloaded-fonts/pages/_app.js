import { Abel } from 'next/font/google'
const abel = Abel({ weight: '400', display: 'optional', preload: false })

function MyApp({ Component, pageProps }) {
  return (
    <div className={abel.className}>
      <Component {...pageProps} />
    </div>
  )
}

export default MyApp
