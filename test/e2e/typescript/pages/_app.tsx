import type { AppType } from 'next/app'

// `foo` comes from `MyApp.getInitialProps` and is spread onto the top-level
// App props at runtime, so it must type-check as a top-level prop (not as
// `pageProps.foo`). See https://github.com/vercel/next.js/issues/42846
const MyApp: AppType<{ foo: string }> = ({ Component, pageProps, foo }) => {
  return (
    <>
      <span id="app-initial-prop">{foo}</span>
      <Component {...pageProps} />
    </>
  )
}

MyApp.getInitialProps = () => ({ foo: 'bar' })

export default MyApp
