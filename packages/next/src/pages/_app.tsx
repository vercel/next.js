import App, { AppContext, AppProps } from "next/app";

type MyInitialProps = Pick<AppProps, "Component" | "pageProps"> & {
  foo: string;
};

const MyApp = ({ Component, pageProps, foo }: MyInitialProps) => {
  return (
    <div>
      <Component {...pageProps} />
      <hr />
      <p>{`props.foo: ${foo}`}</p>
      <p>{`props.pageProps.foo: ${pageProps.foo}`}</p>
    </div>
  );
};

MyApp.getInitialProps = async (context: AppContext) => {
  const ctx = await App.getInitialProps(context); // <--another separate issue
  return {
    ...ctx,
    foo: "bar" // TS complains MyApp type is wrong if this line is excluded
  };
};

export default MyApp;
