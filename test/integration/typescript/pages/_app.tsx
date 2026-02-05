import type { AppType } from 'next/app'

const MyApp: AppType<{ foo: string }> = ({ Component, pageProps, foo }) => {
  // foo should be available directly on props (from getInitialProps)
  // This tests the fix for https://github.com/vercel/next.js/issues/42846
  console.log('foo from getInitialProps:', foo)
  return <Component {...pageProps} />
}

MyApp.getInitialProps = () => ({ foo: 'bar', pageProps: {} })

export default MyApp
