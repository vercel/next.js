import App, { Container } from "next/app";
import React from "react";
import withGraphQLClient from "../lib/with-graphql-client";
import { ClientContext, GraphQLClient } from "graphql-hooks";

type Props = {
  graphQLClient: GraphQLClient;
};

class MyApp extends App<Props> {
  render() {
    const { Component, pageProps, graphQLClient } = this.props;
    return (
      <Container>
        <ClientContext.Provider value={graphQLClient}>
          <Component {...pageProps} />
        </ClientContext.Provider>
      </Container>
    );
  }
}

export default withGraphQLClient(MyApp);
