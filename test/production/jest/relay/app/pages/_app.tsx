import { RelayEnvironmentProvider } from 'react-relay/hooks'
import RelayEnvironment from '@/components/environment'

export default function MyApp({ Component, pageProps }) {
  return (
    <RelayEnvironmentProvider environment={RelayEnvironment}>
      <Component {...pageProps} />
    </RelayEnvironmentProvider>
  )
}
