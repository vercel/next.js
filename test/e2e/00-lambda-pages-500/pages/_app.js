import App from 'next/app'

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

MyApp.getInitialProps = async function (ctx) {
  return App.getInitialProps(ctx)
}

export default MyApp
