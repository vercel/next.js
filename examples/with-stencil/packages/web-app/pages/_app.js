import { useLayoutEffect } from "react";
import { applyPolyfills, defineCustomElements } from "test-component/loader";

export default function App({ Component, pageProps }) {
  useLayoutEffect(() => {
    applyPolyfills().then(() => {
      defineCustomElements(window);
    });
  }, []);
  return <Component {...pageProps} />;
}
