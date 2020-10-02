import { Provider, defaultTheme } from '@adobe/react-spectrum'
import { SSRProvider } from '@react-aria/ssr'

export default function App({ Component, pageProps }) {
  return (
    <SSRProvider>
      <Provider theme={defaultTheme} minHeight="100%">
        <Component {...pageProps} />
      </Provider>
    </SSRProvider>
  )
}
