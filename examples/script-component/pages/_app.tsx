import { AppProps } from "next/app";
import Link from "next/link";

import "../styles/global.css";

const MyApp = ({ Component, pageProps, router }: AppProps) => {
  const pathname = router.pathname;

  return (
    <>
      <Component {...pageProps} />
      {pathname !== "/" && <Link href="/">See all examples</Link>}
    </>
  );
};

export default MyApp;
