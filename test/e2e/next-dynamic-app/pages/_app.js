import { Render } from '../lib/registry'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      {pageProps.component && <Render name={pageProps.component} />}
    </>
  )
}
