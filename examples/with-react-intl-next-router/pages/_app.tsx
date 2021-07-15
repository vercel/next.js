import App from 'next/app';
import Head from 'next/head';
import {IntlProvider} from 'react-intl';

import polyfills from '../utils/polyfills';

export default function MyApp(props) {
  const {
    Component,
    pageProps,
    locale,
    locales,
    defaultLocale,
    messages,
    asPath,
  } = props;

  return (
    <IntlProvider
      locale={locale}
      defaultLocale={defaultLocale}
      messages={messages}
    >
      <Head>
        {locales.reduce(function (locales, tempLocale) {
          if (
            /** If the current locale iteration is not the application locale. */
            tempLocale !== locale
          ) {
            locales.push(
              <link
                key={tempLocale}
                rel="alternate"
                hrefLang={tempLocale}
                href={getHref(asPath, tempLocale, defaultLocale)}
              />
            );
          }

          return locales;
        }, [])}
      </Head>

      <Component {...pageProps} />
    </IntlProvider>
  );
}

MyApp.getInitialProps = async function (appContext) {
  const {router} = appContext;

  const {locale, defaultLocale, locales, asPath} = router;

  const [, messages, appProps] = await Promise.all([
    polyfills(locale),
    getMessages(locale, defaultLocale),
    App.getInitialProps(appContext),
  ]);

  return {
    ...appProps,
    messages,
    locale,
    locales,
    defaultLocale,
    asPath,
  };
};

function getHref(asPath, locale, defaultLocale) {
  let href;

  if (locale === defaultLocale) {
    href = `/${asPath}`;
  } else {
    href = `/${locale}${asPath}`;
  }

  href = href.replace(/\/*$/, '');

  if ('' === href) {
    return '/';
  } else {
    return href;
  }
}

function getMessages(locale, defaultLocale) {
  return import(`../intl/compiled-lang/${locale}.json`)
    .catch(function () {
      return import(`../intl/compiled-lang/${defaultLocale}.json`);
    })
    .catch(function () {
      throw new Error('Messages of the default locale cannot be found.');
    });
}
