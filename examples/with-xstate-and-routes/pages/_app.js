import Flow from "state/flowContext";

function TestApp({ Component, pageProps }) {
  return (
    <Flow.Provider>
      <Component {...pageProps} />
    </Flow.Provider>
  );
}

export default TestApp;
