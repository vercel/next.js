import 'nextra-theme-blog/style.css'
import type { AppProps } from 'next/app'
import '../styles/main.css'

const App = ({ Component, pageProps }: AppProps) => {
  return <Component {...pageProps} />
}

export default App
