/** If you want to default to app router move this file to app folder and remove pages/index.tsx file */

import Link from 'next/link'
import Image from 'next/image'
import { Inter } from 'next/font/google'
import styles from './Home.module.css'

const inter = Inter({ subsets: ['latin'] })

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
            By{' '}
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
        style={{ display: 'flex', flexDirection: 'column', rowGap: '1rem' }}
      >
        <p className={inter.className}>
          See how Sentry records unhandled exceptions in your code.
        </p>
        <div className={styles.description}>
          <p className={inter.className}>
            <strong>Important:</strong> exceptions in development mode take a
            different path than in production. These tests should be run on a
            production build (i.e.{' '}
            <code className={styles.code}>next build</code>
            ).{' '}
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
            Pages API routes <span>-&gt;</span>
          </h2>
          <p className={inter.className}>
            The following examples are Sentry tests. Note that 1 and 2 are not
            expected to work if deployed to Vercel yet.
          </p>
          <p className={inter.className}>
            Top-of-module promise that rejects, but its result is not awaited.
            {'  '}
            <code className={styles.code}>
              <a className={styles.link} href="/api/test1" target="_blank">
                API Test 1
              </a>
            </code>
          </p>
          <p className={inter.className}>
            API has a top-of-module exception.{' '}
            <code className={styles.code}>
              <a className={styles.link} href="/api/test2" target="_blank">
                API Test 2
              </a>
            </code>
          </p>
          <p className={inter.className}>
            API with an exception in its request handler.{' '}
            <code className={styles.code}>
              <a className={styles.link} href="/api/test3" target="_blank">
                API Test 3
              </a>
            </code>
          </p>
          <p className={inter.className}>
            API uses a try/catch to handle an exception and records it.{' '}
            <code className={styles.code}>
              <a className={styles.link} href="/api/test4" target="_blank">
                API Test 4
              </a>
            </code>
          </p>
        </div>
        <div className={styles.card}>
          <h2 className={inter.className}>
            APP Router Route/API handler <span>-&gt;</span>
          </h2>
          <p className={inter.className}>
            Sentry is on a mission to provide first class support for app
            directory route handlers. Until this goal is acheived use
            `Sentry.captureException` to log errors to Sentry
          </p>

          <p className={inter.className}>
            App router route handler error cought via Sentry.captureException.
            {'  '}
            <code className={styles.code}>
              <a className={styles.link} href="/routes/test1" target="_blank">
                APP router route handler test
              </a>
            </code>
          </p>
        </div>

        <div className={styles.card}>
          <h2 className={inter.className}>
            Client/Server component exceptions <span>-&gt;</span>
          </h2>
          <p className={inter.className}>
            There is a top-of-module Promise that rejects, but its result is not
            awaited. Sentry records an Error.{' '}
            <code className={styles.code}>
              <Link className={styles.link} href="/test1">
                Test 1
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            There is a top-of-module exception. error.tsx should render and
            record ReferenceError('process is not defined') in Sentry.{' '}
            <code className={styles.code}>
              <Link className={styles.link} href="/test2">
                Test 2
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            There is an exception during React lifecycle that is caught by
            Next.js's React Error Boundary. In this case, when the component
            mounts. This causes error.tsx to render and records Error in Sentry.{' '}
            <code className={styles.code}>
              <Link className={styles.link} href="/test3">
                Test 3
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            There is an unhandled Promise rejection during React lifecycle. In
            this case, when the component mounts. Sentry records an Error.{' '}
            <code className={styles.code}>
              <Link className={styles.link} href="/test4">
                {' '}
                Test 4
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            An Error is thrown from an event handler. Sentry records an Error.
            (This page also demonstrates how to manually instrument your code
            for performance monitoring.){' '}
            <code className={styles.code}>
              <Link className={styles.link} href="/test5">
                Test 5
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            An Error is thrown becasue client side code is used in server
            component{' '}
            <code className={styles.code}>
              <Link className={styles.link} href="/test5">
                Test 6
              </Link>
            </code>
          </p>
          <p className={inter.className}>
            An Error is thrown during async data fetcihng in server component.{' '}
            <code className={styles.code}>
              <Link className={styles.link} href="/test5">
                Test 7
              </Link>
            </code>
          </p>
        </div>
        <div className={styles.card}>
          <h2 className={inter.className}>
            NextJS 13 Features <span>-&gt;</span>
          </h2>
          <p className={inter.className}>
            NextJS 13 continues to bring many new features to developers,
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
            seen in the{' '}
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
              <Link className={styles.link} href="/test5">
                Trigger Edge Function
              </Link>
            </code>
          </p>
        </div>
      </div>
    </main>
  )
}
