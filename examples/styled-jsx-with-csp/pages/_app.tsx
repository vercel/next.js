import type { AppProps } from 'next/app'

export default function CustomApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

//  Disable static optimization to always server render, making nonce unique on every request
CustomApp.getInitialProps = () => ({})
