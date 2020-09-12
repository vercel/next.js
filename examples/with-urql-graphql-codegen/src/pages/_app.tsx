import { AppProps } from 'next/app';
import { Provider } from 'urql';

import { useUrql } from '../lib/urql';

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
  const client = useUrql();

  return (
    <Provider value={client}>
      <Component {...pageProps} />
    </Provider>
  );
};

export default App;
