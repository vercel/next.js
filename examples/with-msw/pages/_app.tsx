import { AppProps } from 'next/app'

if (process.env.NEXT_PUBLIC_API_MOCKING === 'enabled') {
  const { initMocks } = require('../mocks')
  await initMocks()
}

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
