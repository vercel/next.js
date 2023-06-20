import localFont from '@next/font/local'

const myFont = localFont({ src: './my-font.woff2' })

function MyApp({ Component, pageProps }) {
  return (
    <div className={myFont.className}>
      <Component {...pageProps} />
    </div>
  )
}

export default MyApp
