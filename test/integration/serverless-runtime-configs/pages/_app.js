import getConfig from 'next/config'

const config = getConfig()

export default ({ Component, pageProps }) => (
  <>
    <p id="app-config">{JSON.stringify(config)}</p>
    <Component {...pageProps} />
  </>
)
