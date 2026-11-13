import type { AppProps } from "next/app";
import { Provider } from "react-redux";
import { useRef } from "react";
import { initializeStore } from "../redux/store";

export default function App({ Component, pageProps }: AppProps) {
  const storeRef = useRef<ReturnType<typeof initializeStore> | null>(null);

  if (!storeRef.current) {
    // Initialize the store with server-side preloaded state
    storeRef.current = initializeStore(pageProps.initialReduxState);
  }

  return (
    <Provider store={storeRef.current}>
      <Component {...pageProps} />
    </Provider>
  );
}
