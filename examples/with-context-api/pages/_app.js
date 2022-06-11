import { CounterProvider } from '../components/Counter'

export default function MyApp({ Component, pageProps }) {
  return (
    <CounterProvider>
      <Component {...pageProps} />
    </CounterProvider>
  )
}
