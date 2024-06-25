import { Theme } from "@twilio-paste/core/theme";

function MyApp({ Component, pageProps }) {
  return (
    <Theme.Provider theme="default">
      <Component {...pageProps} />
    </Theme.Provider>
  );
}

export default MyApp;
