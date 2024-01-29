import { DIRECTIONS } from "react-with-direction";
import AphroditeInterface from "react-with-styles-interface-aphrodite";
import WithStylesContext from "react-with-styles/lib/WithStylesContext";
import ThemedStyleSheet from "react-with-styles/lib/ThemedStyleSheet";
import defaultTheme from "../defaultTheme";

function MyApp(props) {
  const { Component, pageProps } = props;

  ThemedStyleSheet.registerInterface(AphroditeInterface);

  return (
    <WithStylesContext.Provider
      value={{
        stylesInterface: AphroditeInterface,
        stylesTheme: defaultTheme,
        direction: DIRECTIONS.LTR,
      }}
    >
      <Component {...pageProps} />
    </WithStylesContext.Provider>
  );
}

export default MyApp;
