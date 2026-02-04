import { GraphQLProvider } from "graphql-react";
import { withGraphQLApp } from "next-graphql-react";

const App = ({ Component, pageProps, graphql }) => (
  <GraphQLProvider graphql={graphql}>
    <Component {...pageProps} />
  </GraphQLProvider>
);

export default withGraphQLApp(App);
