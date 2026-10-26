import type { AppType } from 'next/app'

const MyApp: AppType<{ foo: string }> = ({ Component, pageProps, foo }) => {
  return <Component {...pageProps} data-foo={foo} />
}

MyApp.getInitialProps = () => ({ foo: 'bar' })

export default MyApp
