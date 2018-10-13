import { InMemoryCache, NormalizedCacheObject } from "apollo-cache-inmemory";
import { ApolloClient } from "apollo-client";
import { setContext } from "apollo-link-context";
import { createHttpLink } from "apollo-link-http";
import isomorphicFetch from "isomorphic-fetch";
import App, { Container } from "next/app";
import React from "react";
import { ApolloProvider } from "react-apollo";
import { css } from "./app_css";

const httpLink = createHttpLink({
  fetch: isomorphicFetch,
  uri: "https://graphql.myshopify.com/api/graphql",
});

const middlewareLink = setContext(() => ({
  headers: {
    "X-Shopify-Storefront-Access-Token": "dd4d4dc146542ba7763305d71d1b3d38",
  },
}));

const isServer = (typeof window === "undefined"); // tslint:disable-line
let appGlobalClient:ApolloClient<NormalizedCacheObject> = null as any;

export default class MyApp extends App {

  public client:ApolloClient<NormalizedCacheObject> = null as any;
  constructor (props) {
    super(props);
    if (appGlobalClient === null || isServer) { // tslint:disable-line
      appGlobalClient = new ApolloClient({
        cache: new InMemoryCache(),
        link: middlewareLink.concat(httpLink),
      });
    }
    this.client = appGlobalClient;
  }

  public render () {
    const { Component, pageProps } = this.props;
    return (
      <Container>
        <ApolloProvider client={this.client}>
          <style>{css}</style>
          <div>
            <Component {...pageProps} />
          </div>
        </ApolloProvider>
      </Container>
    );
  }
}
