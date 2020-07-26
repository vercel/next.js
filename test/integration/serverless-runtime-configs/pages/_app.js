import getConfig from 'next/config'

const config = getConfig()

export default function App({ Component, pageProps }) {
  return (
    <>
      <p id="app-config">{JSON.stringify(config)}</p>
      <Component {...pageProps} />
    </>
  )
}
