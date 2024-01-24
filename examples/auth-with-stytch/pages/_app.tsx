import "../styles/globals.css";
import styles from "../styles/Home.module.css";
import type { AppProps } from "next/app";
import React from "react";
import Head from "next/head";
import Image from "next/image";
import stytchLogo from "/public/stytch-logo.svg";
import vercelLogo from "/public/vercel-logotype-dark.svg";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <React.Fragment>
      <Head>
        <link rel="icon" href="/favicon.png" type="image/png" />
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width"
        />
        <title>Stytch + Next.js example app</title>
      </Head>
      <div className={styles.nav}>
        <div className={styles.navLogos}>
          <a
            href="https://stytch.com"
            rel="noopener noreferrer"
            target="_blank"
          >
            <Image alt="Stytch logo" height={20} src={stytchLogo} width={105} />
          </a>
          <p className={styles.navPlusSign}> + </p>
          <a
            href="https://vercel.com"
            rel="noopener noreferrer"
            target="_blank"
          >
            <Image alt="Vercel logo" height={20} src={vercelLogo} width={105} />
          </a>
        </div>
        <div className={styles.docsNavItem}>
          <a
            href="https://stytch.com/docs"
            rel="noopener noreferrer"
            target="_blank"
          >
            Docs
          </a>
        </div>
      </div>
      <div className={styles.root}>
        <Component {...pageProps} />
      </div>
    </React.Fragment>
  );
}
export default MyApp;
