import type { AppProps } from 'next/app'
import withTheme from '../theme'
import '../styles/vars.css'
import '../styles/global.css'
import '../public/antd.min.css'

function MyApp({ Component, pageProps }: AppProps) {
  return withTheme(<Component {...pageProps} />)
}

export default MyApp
