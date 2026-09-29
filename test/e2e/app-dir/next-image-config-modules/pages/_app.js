import { initialConfig } from 'test-external-image-config'

// Page-data workers load _app before the page entry can register its options.
if (initialConfig.path !== '/custom-image') {
  throw new Error('External image options were not registered before _app')
}

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}
