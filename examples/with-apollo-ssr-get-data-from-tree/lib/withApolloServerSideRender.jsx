import App from 'next/app';
import Head from 'next/head';
import React, { useMemo } from 'react';
import { ApolloCacheControl } from './ApolloCacheControl';



// Gets the display name of a JSX component for dev tools
function getDisplayName(Component) {
  return Component.displayName || Component.name || 'Unknown';
}

export default function withApolloServerSideRender(PageComponent) {
  const ApolloCacheControlContext = ApolloCacheControl.getContext();

  function WithApollo({ apolloCacheControlSnapshot, apolloCacheControl, ...props }) {
    const _apolloCacheControl = useMemo(
      () => apolloCacheControl || new ApolloCacheControl(), [apolloCacheControl],
    );

    if (apolloCacheControlSnapshot && Object.keys(apolloCacheControlSnapshot).length) {
      _apolloCacheControl.restoreSnapshot(apolloCacheControlSnapshot);
    }
    
    return (
      <ApolloCacheControlContext.Provider value={_apolloCacheControl}>
        <PageComponent {...props} />
      </ApolloCacheControlContext.Provider>
    );
  }

  WithApollo.displayName = `WithApollo(${getDisplayName(PageComponent)})`;

  WithApollo.getInitialProps = async (ctx) => {
    const { AppTree } = ctx;
    const isInAppContext = Boolean(ctx.ctx);

    let pageProps = {};
    if (PageComponent.getInitialProps) {
      pageProps = { ...pageProps, ...(await PageComponent.getInitialProps(ctx)) };
    } 

    if (typeof window !== 'undefined') {
      return pageProps;
    }

    if (ctx.res && (ctx.res.headersSent || ctx.res.writableEnded)) {
      return pageProps;
    }

    const apolloCacheControl = new ApolloCacheControl();

    try {
      const { getDataFromTree } = await import('@apollo/client/react/ssr');
      // Since AppComponents and PageComponents have different context types
      // we need to modify their props a little.
      let props;
      if (isInAppContext) {
        props = { ...pageProps, apolloCacheControl };
      } else {
        props = { pageProps: { ...pageProps, apolloCacheControl } };
      }

      await getDataFromTree(<AppTree {...props} />);
    } catch (error) {
      // Prevent Apollo Client GraphQL errors from crashing SSR.
      // Handle them in components via the data.error prop:
      // https://www.apollographql.com/docs/react/api/react-apollo.html#graphql-query-data-error
      apolloCacheControl.seal();
      console.error('Error while running `getDataFromTree`', error);
    }

    // getDataFromTree does not call componentWillUnmount
    // head side effect therefore need to be cleared manually
    Head.rewind();
    return {
      ...pageProps,
      apolloCacheControlSnapshot: apolloCacheControl.getSnapshot(),
    };
  };

  return WithApollo;
}
