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
      <strong>Important:</strong> exceptions in development mode take a
      different path than in production. These tests should be run on a
      production build (i.e. 'next build').{' '}
      <a href="https://nextjs.org/docs/advanced-features/custom-error-page#customizing-the-error-page">
        Read more
      </a>
    </p>
    <ol>
      <li>SSR exceptions</li>
      <ol>
        <li>
          getServerSideProps throws an Error. This should cause _error.js to
          render and record Error('SSR Test 1') in Sentry.{' '}
          <a href="/ssr/test1" target="_blank">
            Open in a new tab
          </a>
        </li>
        <li>
          getServerSideProps returns a Promise that rejects. This should cause
          _error.js to render and record Error('SSR Test 2') in Sentry.{' '}
          <a href="/ssr/test2" target="_blank">
            Open in a new tab
          </a>
        </li>
        <li>
          getServerSideProps calls a Promise that rejects, but does not handle
          the rejection or await its result (returning synchronously). Sentry
          should record Error('SSR Test 3').{' '}
          <a href="/ssr/test3" target="_blank">
            Open in a new tab
          </a>
        </li>
      </ol>

      <li>Client exceptions</li>
      <ol>
        <li>
          There is a top-of-module Promise that rejects, but its result is not
          awaited. Sentry should record Error('Client Test 1').{' '}
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
          ReferenceError('process is not defined') in Sentry.{' '}
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
          Next.js's React Error Boundary. In this case, when the component
          mounts. This should cause _error.js to render and record Error('Client
          Test 3') in Sentry.{' '}
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
          Error('Client Test 4').{' '}
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
          Error('Client Test 5').{' '}
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
