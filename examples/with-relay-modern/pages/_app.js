import { ReactRelayContext } from "react-relay";
import { useEnvironment } from "../lib/relay";

export default function App({ Component, pageProps }) {
  const environment = useEnvironment(pageProps.initialRecords);

  return (
    <ReactRelayContext.Provider value={{ environment, variables: {} }}>
      <Component {...pageProps} />
    </ReactRelayContext.Provider>
  );
}
