// The full definition of the default _app.js file is in
// https://github.com/vercel/next.js/blob/canary/packages/next/pages/_app.tsx

import { loadGetInitialProps } from "@vercel/turbopack-next/internal/shared-utils";

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

async function appGetInitialProps({ Component, ctx }) {
  const pageProps = await loadGetInitialProps(Component, ctx);
  return { pageProps };
}

App.getInitialProps = appGetInitialProps;
