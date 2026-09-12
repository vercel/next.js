import type { AppType } from 'next/app'

const MyApp: AppType<{ foo: string }> = ({ Component, pageProps }) => {
  return <Component {...pageProps} />
}

MyApp.getInitialProps = () => ({ pageProps: { foo: 'bar' } })

export default MyApp
