import { Provider as StyletronProvider } from 'styletron-react'
import { styletron } from '../styletron'

export default function App({ Component, pageProps }) {
  return (
    <StyletronProvider value={styletron}>
      <Component {...pageProps} />
    </StyletronProvider>
  )
}
