import { fork, serialize } from "effector";
import { Provider as EffectorProvider } from "effector-react/scope";

let clientScope;

const App = ({ Component, pageProps }) => {
  // For SSG and SSR always create a new Effector Scope
  // and merge it with client-side scope if it exist
  const scope = fork({
    values: {
      ...(clientScope ? serialize(clientScope) : {}),
      ...(pageProps.initialEffectorState ?? {}),
    },
  });

  // For CSR, re-use same scope.
  if (typeof window !== "undefined") clientScope = scope;

  return (
    <EffectorProvider value={scope}>
      <Component {...pageProps} />
    </EffectorProvider>
  );
};

export default App;
