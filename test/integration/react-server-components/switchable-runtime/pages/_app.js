export default function App({ Component, pageProps }) {
  return (
    <div className="app-client-root" data-title={Component.title || ''}>
      <Component {...pageProps} />
    </div>
  )
}
