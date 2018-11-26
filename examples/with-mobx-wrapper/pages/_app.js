import React from 'react';
import Router from 'next/router';
import ErrorPage from 'next/error';
import App, {Container} from 'next/app';
import {withMobx} from 'next-mobx-wrapper';
import {configure} from 'mobx';
import NProgress from 'nprogress';
import {Provider, useStaticRendering} from 'mobx-react';

import Css from '../components/Css';

import * as getStores from '../stores';

const isServer = !process.browser;

configure({enforceActions: 'observed'});
useStaticRendering(isServer); // NOT `true` value

Router.onRouteChangeStart = NProgress.start;
Router.onRouteChangeComplete = NProgress.done;
Router.onRouteChangeError = NProgress.done;

class MyApp extends App {
  static async getInitialProps({Component, ctx}) {
    let pageProps = {};

    if (typeof Component.getInitialProps === 'function') {
      pageProps = await Component.getInitialProps(ctx);
    }

    return {pageProps};
  }

  render() {
    const {Component, pageProps, store, testStore} = this.props;
    const {statusCode} = pageProps;

    if (statusCode && statusCode >= 400) {
      return <ErrorPage statusCode={statusCode} />;
    }

    return (
      <Container>
        <Provider {...store}>
          <>
            <Component {...pageProps} />
            <Css />
          </>
        </Provider>
      </Container>
    );
  }
}

export default withMobx(getStores)(MyApp);
