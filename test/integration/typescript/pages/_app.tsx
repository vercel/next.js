import type { AppType } from 'next/app'

const MyApp: AppType<{ foo: string }> = ({ Component, pageProps, foo }) => {
  return (
    <>
      <span id="app-foo" hidden>
        {foo}
      </span>
      <Component {...pageProps} />
    </>
  )
}

MyApp.getInitialProps = () => ({ foo: 'bar', pageProps: {} })

export default MyApp
