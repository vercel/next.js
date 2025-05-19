"use client";

import { NhostProvider } from "@nhost/react";
import { nhost } from "../lib/nhost-client";
import { NhostApolloProvider } from "@nhost/react-apollo";

export default function App({ children }) {
  //  initial={pageProps.nhostSession}
  return (
    <NhostProvider nhost={nhost}>
      <NhostApolloProvider nhost={nhost}>{children}</NhostApolloProvider>
    </NhostProvider>
  );
}
