import Link from 'next/link'

const Index = () => (
  <div style={{ maxWidth: 700, margin: '0 auto' }}>
    <h2>Sentry Simple Example 🚨</h2>
    <p>
      This example demonstrates how to record unhandled exceptions in your code
      with Sentry. There are several test pages below that result in various
      kinds of unhandled exceptions.
    </p>
    <p>
      It also demonstrates the performance monitoring the SDK is able to do:
      <ol>
        <li>
          A front-end transaction is recorded for each pageload or navigation.
        </li>
        <li>
          A backend transaction is recorded for each API or page route. (Note
          that currently only API routes are traced on Vercel.)
        </li>
        <li>
          Errors which occur during transactions are linked to those
          transactions in Sentry and can be found in the [trace
          navigator](https://docs.sentry.io/product/sentry-basics/tracing/trace-view/).
        </li>
        <li>
          Manual performance instrumentation is demonstrated in the final
          example below (throwing an error from an event handler).
        </li>
      </ol>
    </p>
    <p>
      <strong>Important:</strong> exceptions in development mode take a
      different path than in production. These tests should be run on a
      production build (i.e. &#39;next build&#39;).{' '}
      <a href="https://nextjs.org/docs/advanced-features/custom-error-page#customizing-the-error-page">
        Read more
      </a>
    </p>
    <ol>
      <li>API route exceptions/transactions</li>
      Note that 1 and 2 are not expected to work if deployed to Vercel yet.
      <ol>
        <li>
          API has a top-of-module Promise that rejects, but its result is not
          awaited. Sentry should record Error(&#39;API Test 1&#39;).{' '}
          <a href="/api/test1" target="_blank">
            Open in a new tab
          </a>
        </li>
        <li>
          API has a top-of-module exception. Sentry should record Error(&#39;API
          Test 2&#39;).{' '}
          <a href="/api/test2" target="_blank">
            Open in a new tab
          </a>
        </li>
        <li>
          API has has an exception in its request handler. Sentry should record
          Error(&#39;API Test 3&#39;).{' '}
          <a href="/api/test3" target="_blank">
            Open in a new tab
          </a>
        </li>
        <li>
          API uses a try/catch to handle an exception and records it. Sentry
          should record Error(&#39;API Test 4&#39;).{' '}
          <a href="/api/test4" target="_blank">
            Open in a new tab
          </a>
        </li>
      </ol>
      <li>SSR exceptions/transactions</li>
      Note that there are currently two known bugs with respect to SSR
      transactions: they don&#39;t get recorded on Vercel, and ones that are
      recorded and have an error are grouped in the Sentry UI by the error page
      name rather than the requested page name.
      <ol>
        <li>
          getServerSideProps throws an Error. This should cause _error.js to
          render and record Error(&#39;SSR Test 1&#39;) in Sentry.{' '}
          <a href="/ssr/test1" target="_blank">
            Open in a new tab
          </a>{' '}
          or{' '}
          <Link href="/ssr/test1">
            <a>Perform client side navigation</a>
          </Link>
        </li>
        <li>
          getServerSideProps returns a Promise that rejects. This should cause
          _error.js to render and record Error(&#39;SSR Test 2&#39;) in Sentry.{' '}
          <a href="/ssr/test2" target="_blank">
            Open in a new tab
          </a>
        </li>
        <li>
          getServerSideProps calls a Promise that rejects, but does not handle
          the rejection or await its result (returning synchronously). Sentry
          should record Error(&#39;SSR Test 3&#39;), but <strong>will not</strong> when
          deployed to Vercel because the serverless function will already have
          exited.{' '}
          <a href="/ssr/test3" target="_blank">
            Open in a new tab
          </a>
        </li>
        <li>
          getServerSideProps manually captures an exception from a try/catch.
          This should record Error(&#39;SSR Test 4&#39;) in Sentry.{' '}
          <a href="/ssr/test4" target="_blank">
            Open in a new tab
          </a>
        </li>
      </ol>
      <li>Client exceptions</li>
      <ol>
        <li>
          There is a top-of-module Promise that rejects, but its result is not
          awaited. Sentry should record Error(&#39;Client Test 1&#39;).{' '}
          <Link href="/client/test1">
            <a>Perform client side navigation</a>
          </Link>{' '}
          or{' '}
          <a href="/client/test1" target="_blank">
            Open in a new tab
          </a>
        </li>
        <li>
          There is a top-of-module exception. _error.js should render and record
          ReferenceError(&#39;process is not defined&#39;) in Sentry.{' '}
          <Link href="/client/test2">
            <a>Perform client side navigation</a>
          </Link>{' '}
          or{' '}
          <a href="/client/test2" target="_blank">
            Open in a new tab
          </a>
        </li>
        <li>
          There is an exception during React lifecycle that is caught by
          Next.js&#39;s React Error Boundary. In this case, when the component
          mounts. This should cause _error.js to render and record Error(&#39;Client
          Test 3&#39;) in Sentry.{' '}
          <Link href="/client/test3">
            <a>Perform client side navigation</a>
          </Link>{' '}
          or{' '}
          <a href="/client/test3" target="_blank">
            Open in a new tab
          </a>
        </li>
        <li>
          There is an unhandled Promise rejection during React lifecycle. In
          this case, when the component mounts. Sentry should record
          Error(&#39;Client Test 4&#39;).{' '}
          <Link href="/client/test4">
            <a>Perform client side navigation</a>
          </Link>{' '}
          or{' '}
          <a href="/client/test4" target="_blank">
            Open in a new tab
          </a>
        </li>
        <li>
          An Error is thrown from an event handler. Sentry should record
          Error(&#39;Client Test 5&#39;). (This page also demonstrates how to manually
          instrument your code for performance monitoring.){' '}
          <Link href="/client/test5">
            <a>Perform client side navigation</a>
          </Link>{' '}
          or{' '}
          <a href="/client/test5" target="_blank">
            Open in a new tab
          </a>
        </li>
      </ol>
    </ol>
  </div>
)

export default Index
