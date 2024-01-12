import { globalStyles } from "../shared/styles";

const App = ({ Component, pageProps }) => (
  <>
    {globalStyles}
    <Component {...pageProps} />
  </>
);

export default App;
