import { createIntl, createIntlCache, RawIntlProvider } from 'react-intl'

// This is optional but highly recommended
// since it prevents memory leak
const cache = createIntlCache()

function MyApp({ Component, pageProps, locale, messages }) {
  const intl = createIntl(
    {
      locale,
      messages,
    },
    cache
  )
  return (
    <RawIntlProvider value={intl}>
      <Component {...pageProps} />
    </RawIntlProvider>
  )
}

MyApp.getInitialProps = async ({ Component, ctx }) => {
  let pageProps = {}

  const { req } = ctx
  const locale = req?.locale ?? ''
  const messages = req?.messages ?? {}

  if (Component.getInitialProps) {
    Object.assign(pageProps, await Component.getInitialProps(ctx))
  }

  return { pageProps, locale, messages }
}

export default MyApp
