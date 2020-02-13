import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
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
    <div className="container">
      <header>
        <div className="header-content">
          <Link href="/">
            <a className="logo">
              <img src="/logo.png" />
            </a>
          </Link>
          <h1>
            <span className="light">Stripe Sample</span>
            <br />
            Next.js, TypeScript, and Stripe 🔒💸
          </h1>
        </div>
      </header>
      {children}
    </div>
    <div className="banner">
      <span>
        This is a{' '}
        <a
          href="https://github.com/stripe-samples"
          target="_blank"
          rel="noopener noreferrer"
        >
          Stripe Sample
        </a>
        .{' View code on '}
        <a
          href="https://github.com/zeit/next.js/tree/canary/examples/with-stripe-typescript"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        .
      </span>
    </div>
  </Elements>
)

export default Layout
