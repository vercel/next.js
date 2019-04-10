import Router from "next/router";
import Link from "next/link";
import Header from "../header";
import Footer from "../footer";

function Layout({ path, children, pageTitle = "Next.js Blog Starter" }) {
  return (
    <>
      <Header path={path} pageTitle={pageTitle} />

      <main className="wrap">{children}</main>

      <Footer />
      <style jsx global>{`
        html {
          margin: 0;
          box-sizing: border-box;
        }

        *,
        *:before,
        *:after {
          box-sizing: inherit;
        }

        body {
          margin: 0;
          font-size: 20px;
          font-family: "PT Sans", sans-serif;
          font-weight: 400;
          color: #333;
          line-height: 1.5;
        }

        h1,
        h2,
        h3,
        h4 {
          margin-bottom: 0.5rem;
          font-weight: bold;
          color: #313131;
          line-height: 1.25;
        }

        h1 {
          font-size: 2rem;
        }

        h2 {
          margin-top: 1rem;
          font-size: 1.8rem;
        }

        h3 {
          margin-top: 1.5rem;
          font-size: 1.5rem;
        }

        p {
          margin-top: 0;
          margin-bottom: 1rem;
        }

        ul,
        ol,
        dl {
          margin-top: 0;
          margin-bottom: 1rem;
        }

        a {
          color: #268bd2;
          text-decoration: none;
        }

        a:hover,
        a:focus {
          text-decoration: underline;
        }

        hr {
          position: relative;
          margin: 1.5em 0;
          border: 0;
          border-top: 1px solid #eee;
          border-bottom: 1px solid #fff;
        }

        blockquote {
          padding: 0.5em 1em;
          margin: 0.8em 0;
          color: #555;
          border-left: 0.25em solid #ccc;
        }

        blockquote p:last-child {
          margin-bottom: 0;
        }

        pre code {
          font-size: 18px;
        }

        .wrap {
          max-width: 38rem;
          margin-left: auto;
          margin-right: auto;
        }
      `}</style>
    </>
  );
}

export default Layout;
