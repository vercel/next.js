import { NextIntlProvider } from 'next-intl'
import NextApp from 'next/app'

export default function App({ Component, messages, pageProps }) {
  // You can merge messages that should always be present
  // (from `App.getInitialProps`) with page-level
  // messages (from `getStaticProps` of individual pages)
  const allMessages = { ...messages, ...pageProps.messages }

  // To achieve consistent date, time and number formatting
  // across the app, you can define a set of global formats.
  const formats = {
    dateTime: {
      short: {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      },
    },
  }

  return (
    <NextIntlProvider formats={formats} messages={allMessages}>
      <Component {...pageProps} />
    </NextIntlProvider>
  )
}

App.getInitialProps = async function getInitialProps(context) {
  const { locale } = context.router
  return {
    ...(await NextApp.getInitialProps(context)),
    messages: locale ? require(`../messages/${locale}.json`) : undefined,
  }
}
