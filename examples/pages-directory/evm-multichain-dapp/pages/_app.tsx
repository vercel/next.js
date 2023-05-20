import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { Web3ReactProvider } from '@web3-react/core'

function MyApp({ Component, pageProps }: AppProps) {
  const getLibrary = (provider: any) => {
    return provider
  }

  return (
    <>
      <Web3ReactProvider getLibrary={getLibrary}>
        <Component {...pageProps} />
      </Web3ReactProvider>
    </>
  )
}

export default MyApp
