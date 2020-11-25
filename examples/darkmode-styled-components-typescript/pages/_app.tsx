import { AppProps } from 'next/app'

import GlobalStyle from '../styles/globals'

function MyApp({ Component, pageProps }: AppProps): JSX.Element {
  return (
    <>
      <Component {...pageProps} />
      <GlobalStyle />
    </>
  )
}

export default MyApp
