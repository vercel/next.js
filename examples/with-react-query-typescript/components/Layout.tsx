import React, { ReactNode } from "react";
import Link from "next/link";
import Head from "next/head";

type Props = {
  children?: ReactNode;
};

const Layout = ({ children }: Props) => (
  <>
    <Head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="initial-scale=1.0, width=device-width" />
    </Head>
    <div
      style={{
        margin: "60px auto",
        maxWidth: "800px",
      }}
    >
      <header>
        <nav>
          <Link href="/">
            <a>Home</a>
          </Link>{" "}
          <Link href="/posts">
            <a>Posts</a>
          </Link>
        </nav>
      </header>
      {children}
    </div>
  </>
);

export default Layout;
