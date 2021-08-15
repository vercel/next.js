import { ErrorBoundary, SxDesignProvider } from '@adeira/sx-design'

import './_app.css'

export default function MyApp({ Component, pageProps }) {
  return (
    <SxDesignProvider locale="en-US" theme="system">
      <ErrorBoundary>
        <Component {...pageProps} />
      </ErrorBoundary>
    </SxDesignProvider>
  )
}
