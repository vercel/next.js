import { StoreProvider } from '../store'

export default function App({
  Component,
  pageProps: { initialState, ...pageProps },
}) {
  return (
    <StoreProvider initialState={initialState}>
      <Component {...pageProps} />
    </StoreProvider>
  )
}
