import "../styles/globals.css";
import type { AppProps } from "next/app";
import { SessionProvider } from "next-auth/react";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    // Note: by passing the session here (through `getServerSideProps`), we can
    // hydrate the page with login state on the server before the client
    // receives it
    <SessionProvider session={pageProps.session}>
      <Component {...pageProps} />
    </SessionProvider>
  );
}
export default MyApp;
