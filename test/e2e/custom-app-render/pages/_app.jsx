export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}

App.getInitialProps = async () => {
  return {}
}
