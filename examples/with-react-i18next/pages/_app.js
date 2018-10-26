import React from 'react'
import App, { Container } from 'next/app'
import { NamespacesConsumer } from 'react-i18next'
import i18n from '../i18n'

// Using _app with translated content will give a warning:
// Warning: Did not expect server HTML to contain a <h1> in <div>.
// not sure - did neither find something wrong - nor seems the warning to make sense
export default class MyApp extends App {

  static async getInitialProps({Component, router, ctx}) {
    let pageProps = {};

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx);
    }

    // initialI18nStore and initialLanguage need to be passed into NamespacesConsumer
    // for any page that is not wrapped with withI18next to enable ssr localized rendering
    let i18nProps = i18n.getInitialProps(ctx.req, "common");
    return {pageProps, i18nProps};
  }

  render() {
    const { Component, pageProps, i18nProps } = this.props;

    return (
      <Container>
        <NamespacesConsumer
          {...pageProps}
          ns="common"
          i18n={(pageProps && pageProps.i18n) || i18n}
          wait={process.browser}
          initialI18nStore={i18nProps.initialI18nStore}
          initialLanguage={i18nProps.initialLanguage}
        >
          {t => (
            <React.Fragment>
              <h1>{t('common:integrates_react-i18next')}</h1>
              <button
                type="button"
                onClick={() => {
                  i18n.changeLanguage(i18n.languages[0] === 'en' ? 'de' : 'en');
                }}
              >
                Change locale
              </button>
              <Component {...pageProps} />
            </React.Fragment>
          )}
        </NamespacesConsumer>
      </Container>
    );
  }
}
