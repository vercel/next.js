import { NextIntlProvider } from 'next-intl'

export default function App({ Component, messages, pageProps }) {
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
    <NextIntlProvider formats={formats} messages={pageProps.messages}>
      <Component {...pageProps} />
    </NextIntlProvider>
  )
}
