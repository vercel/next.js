import { Open_Sans } from 'next/font/google'
const openSans = Open_Sans({ variable: '--open-sans', subsets: ['latin'] })

function MyApp({ Component, pageProps }) {
  return (
    <>
      <div id="app-open-sans" className={openSans.className}>
        {JSON.stringify(openSans)}
      </div>
      <Component {...pageProps} />
    </>
  )
}

export { openSans }
export default MyApp
