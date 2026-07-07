export default function TestApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

TestApp.getInitialProps = async ({ Component, ctx }) => {
  let pageProps

  if (Component.getInitialProps) {
    pageProps = await Component.getInitialProps(ctx)
  }

  return {
    pageProps,
  }
}
