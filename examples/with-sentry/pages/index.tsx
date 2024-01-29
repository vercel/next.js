import Link from "next/link";

import Image from "next/image";
import { Inter } from "next/font/google";
import styles from "../styles/Home.module.css";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.description}>
        <p>
          New users instrument with:&nbsp;
          <code className={styles.code}>npx @sentry/wizard -s -i nextjs</code>
        </p>
        <div>
          <a
            href="https://vercel.com?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            By{" "}
            <Image
              src="/vercel.svg"
              alt="Vercel Logo"
              className={styles.vercelLogo}
              width={100}
              height={24}
              priority
            />
          </a>
        </div>
      </div>

      <div className={styles.center}>
        <Image
          className={styles.logo}
          src="/next.svg"
          alt="Next.js Logo"
          width={180}
          height={37}
          priority
        />
        <div className={styles.thirteen}>
          <Image src="/thirteen.svg" alt="13" width={40} height={31} priority />
        </div>
      </div>
      <Image
        src="/sentry.svg"
        alt="Sentry Logo"
        width={360}
        height={74}
        priority
      />
      <div
        className={styles.justCenter}
        style={{ display: "flex", flexDirection: "column", rowGap: "1rem" }}
      >
        <p className={inter.className}>
          See how Sentry records unhandled exceptions in your code.
        </p>
        <div className={styles.description}>
          <p className={inter.className}>
            <strong>Important:</strong> exceptions in development mode take a
            different path than in production. These tests should be run on a
            production build (i.e.{" "}
            <code className={styles.code}>next build</code>
            ).{" "}
            <Link
              className={styles.link}
              target="_blank"
              href="https://nextjs.org/docs/advanced-features/custom-error-page#customizing-the-error-page"
            >
              Read more
            </Link>
          </p>
        </div>
      </div>
      <br />
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={inter.className}>
            API routes <span>-&gt;</span>
          </h2>
          <p className={inter.className}>
            The following examples are Sentry tests. Note that 1 and 2 are not
            expected to work if deployed to Vercel yet.
          </p>
          <p className={inter.className}>
            Top-of-module promise that rejects, but its result is not awaited.
            {"  "}
            <code className={styles.code}>
              <a className={styles.link} href="/api/test1" target="_blank">
                API Test 1
              </a>
            </code>
          </p>
          <p className={inter.className}>
            API has a top-of-module exception.{" "}
            <code className={styles.code}>
              <a className={styles.link} href="/api/test2" target="_blank">
                API Test 2
              </a>
            </code>
          </p>
          <p className={inter.className}>
            API with an exception in its request handler.{" "}
            <code className={styles.code}>
              <a className={styles.link} href="/api/test3" target="_blank">
                API Test 3
              </a>
            </code>
          </p>
          <p className={inter.className}>
            API uses a try/catch to handle an exception and records it.{" "}
            <code className={styles.code}>
              <a className={styles.link} href="/api/test4" target="_blank">
                API Test 4
              </a>
            </code>
          </p>
        </div>
        <div className={styles.card}>
          <h2 className={inter.className}>
            SSR <span>-&gt;</span>
          </h2>
          <p className={inter.className}>
            There are currently two known bugs with respect to SSR transactions:
            they don't get recorded on Vercel, and ones that are recorded and
            have an error are grouped in the Sentry UI by the error page name
            rather than the requested page name.
          </p>

          <p className={inter.className}>
            <code className={styles.code}>getServerSideProps </code>
            &nbsp;throws an Error. This should cause _error.js to render and
            record and Error in Sentry.{" "}
            <code className={styles.code}>
              <Link className={styles.link} href="/ssr/test1">
                SSR Test 1
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            <code className={styles.code}>getServerSideProps </code>
            returns a Promise that rejects. This should cause _error.js to
            render and record an Error in Sentry.{" "}
            <code className={styles.code}>
              <Link className={styles.link} href="/ssr/test2">
                SSR Test 2
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            <code className={styles.code}>getServerSideProps </code>
            calls a Promise that rejects, but does not handle the rejection or
            await its result (returning synchronously). Sentry records an Error
            but <strong>will not</strong> when deployed to Vercel because the
            serverless function will already have exited.{" "}
            <code className={styles.code}>
              <Link className={styles.link} href="/ssr/test3">
                SSR Test 3
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            <code className={styles.code}>getServerSideProps </code>
            manually captures an exception from a try/catch. This should record
            Error in Sentry.{" "}
            <code className={styles.code}>
              <Link className={styles.link} href="/ssr/test4">
                SSR Test 4
              </Link>
            </code>
          </p>
        </div>

        <div className={styles.card}>
          <h2 className={inter.className}>
            Client exceptions <span>-&gt;</span>
          </h2>
          <p className={inter.className}>
            There is a top-of-module Promise that rejects, but its result is not
            awaited. Sentry records an Error.{" "}
            <code className={styles.code}>
              <Link className={styles.link} href="/client/test1">
                Client Test 1
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            There is a top-of-module exception. _error.js should render and
            record ReferenceError('process is not defined') in Sentry.{" "}
            <code className={styles.code}>
              <Link className={styles.link} href="/client/test2">
                Client Test 2
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            There is an exception during React lifecycle that is caught by
            Next.js's React Error Boundary. In this case, when the component
            mounts. This causes _error.js to render and records Error in Sentry.{" "}
            <code className={styles.code}>
              <Link className={styles.link} href="/client/test3">
                Client Test 3
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            There is an unhandled Promise rejection during React lifecycle. In
            this case, when the component mounts. Sentry records an Error.{" "}
            <code className={styles.code}>
              <Link className={styles.link} href="/client/test4">
                {" "}
                Client Test 4
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            An Error is thrown from an event handler. Sentry records an Error.
            (This page also demonstrates how to manually instrument your code
            for performance monitoring.){" "}
            <code className={styles.code}>
              <Link className={styles.link} href="/client/test5">
                Client Test 5
              </Link>
            </code>
          </p>
        </div>
        <div className={styles.card}>
          <h2 className={inter.className}>
            Next.js 13 Features <span>-&gt;</span>
          </h2>
          <p className={inter.className}>
            Next.js 13 continues to bring many new features to developers,
            especially those depoying on Vercel. We are trying to keep up, we
            promise!
          </p>
        </div>
        <div className={styles.card}>
          <h2 className={inter.className}>
            Performance <span>-&gt;</span>
          </h2>
          <p className={inter.className}>
            <strong>Why should I care about Performance?</strong>
          </p>
          <p className={inter.className}>
            Front-end transactions are recorded for each pageload or navigation.
          </p>
          <p className={inter.className}>
            Backend transactions are recorded for each API or page route.
          </p>
          <p className={inter.className}>
            Sentry creates links between errors and transactions, and can be
            seen in the{" "}
            <strong>
              <Link
                className={styles.link}
                href="https://docs.sentry.io/product/sentry-basics/tracing/trace-view/"
              >
                trace navigator docs
              </Link>
            </strong>
            .
          </p>
          <p className={inter.className}>
            Manual performance instrumentation is demonstrated in the final
            example below (throwing an error from an event handler).
          </p>
          <p className={inter.className}>
            Add Edge Function example
            <br />
            <code className={styles.code}>
              <Link className={styles.link} href="/client/test5">
                Trigger Edge Function
              </Link>
            </code>
          </p>
        </div>
      </div>
    </main>
  );
}
