import { AppProps } from "next/app";
import { ThemeProvider } from "reflexjs";
import theme from "../src/theme";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider theme={theme}>
      <Component {...pageProps} />
    </ThemeProvider>
  );
}
