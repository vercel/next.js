import * as React from 'react';
import {IntlProvider} from 'react-intl';
import {polyfill} from '../polyfills';
import App from 'next/app';

function MyApp({Component, pageProps, locale, messages}) {
  return (
    <IntlProvider locale={locale} messages={messages}>
      <Component {...pageProps} />
    </IntlProvider>
  );
}

// We need to load and expose the translations on the request for the user's
// locale. These will only be used in production, in dev the `defaultMessage` in
// each message description in the source code will be used.
const getMessages = (locale: string = 'en') => {
  switch (locale) {
    default:
      return import('../compiled-lang/en.json');
    case 'fr':
      return import('../compiled-lang/fr.json');
  }
};

const getInitialProps: typeof App.getInitialProps = async appContext => {
  const {
    ctx: {req},
  } = appContext;
  const locale = (req as any)?.locale ?? 'en';

  const [appProps, messages] = await Promise.all([
    polyfill(locale),
    getMessages(locale),
    App.getInitialProps(appContext),
  ]);

  return {...(appProps as any), locale, messages};
};

MyApp.getInitialProps = getInitialProps;

export default MyApp;
