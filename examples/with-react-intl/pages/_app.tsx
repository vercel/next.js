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

const getInitialProps: typeof App.getInitialProps = async appContext => {
  const {
    ctx: {req},
  } = appContext;
  const locale = (req as any)?.locale ?? 'en';
  const messages = (req as any)?.messages ?? {};
  const [appProps] = await Promise.all([
    polyfill(locale),
    App.getInitialProps(appContext),
  ]);

  return {...appProps, locale, messages};
};

MyApp.getInitialProps = getInitialProps;

export default MyApp;
