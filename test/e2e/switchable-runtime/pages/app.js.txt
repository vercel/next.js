export default function App({ Component, pageProps }) {
  return (
    <div className="app-client-root">
      <Component {...pageProps} />
    </div>
  )
}
