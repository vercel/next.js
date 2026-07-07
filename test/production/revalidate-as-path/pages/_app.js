import { useRouter } from 'next/router'

export default function App({ Component, pageProps }) {
  // we log the asPath during rendering to make sure the value is
  // correct during the /_next/data request since they are kept in sync
  console.log(`asPath: ${useRouter().asPath}`)
  return <Component {...pageProps} />
}
