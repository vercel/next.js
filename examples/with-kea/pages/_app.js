import React from "react";
import { Provider } from "react-redux";
import withRedux from "next-redux-wrapper";
import { initStore } from "../store";

function MyApp({ Component, pageProps, store }) {
  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  );
}

export default withRedux(initStore, {
  debug: process.env.NODE_ENV === "development",
})(MyApp);
