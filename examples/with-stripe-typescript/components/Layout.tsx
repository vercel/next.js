import React from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'

type Props = {
  title?: string
}

const stripePromise = loadStripe(process.env.STRIPE_PUBLISHABLE_KEY!)

const Layout: React.FunctionComponent<Props> = ({
  children,
  title = 'TypeScript Next.js Stripe Example',
}) => (
  <Elements stripe={stripePromise}>
    <Head>
      <title>{title}</title>
      <meta charSet="utf-8" />
      <meta name="viewport" content="initial-scale=1.0, width=device-width" />
    </Head>
    <header>
      <nav>
        <Link href="/">
          <a>Home</a>
        </Link>{' '}
        |{' '}
        <Link href="/donate-with-checkout">
          <a>Donate with Checkout</a>
        </Link>{' '}
        |{' '}
        <Link href="/donate-with-elements">
          <a>Donate with Elements</a>
        </Link>
      </nav>
    </header>
    {children}
    <footer>
      <hr />
      <span>
        This is a{' '}
        <a
          href="https://github.com/stripe-samples"
          target="_blank"
          rel="noopener noreferrer"
        >
          Stripe Sample
        </a>
        .{' '}
        <a
          href="https://github.com/zeit/next.js/tree/canary/examples/with-stripe-typescript"
          target="_blank"
          rel="noopener noreferrer"
        >
          View code on GitHub
        </a>
        .
      </span>
    </footer>
  </Elements>
)

export default Layout
