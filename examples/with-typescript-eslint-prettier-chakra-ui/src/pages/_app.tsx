import { AppProps } from 'next/app';
import { ChakraProvider } from '@chakra-ui/react';

import theme from '../styles/themes/default';

function MyApp({ Component, pageProps }: AppProps): JSX.Element {
  return (
    <ChakraProvider theme={theme}>
      <Component {...pageProps} />
    </ChakraProvider>
  );
}

export default MyApp;
