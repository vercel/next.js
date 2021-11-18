import Head from 'next/head'

import Link from './Link'

const Layout: React.FC = ({ children }) => (
  <div className="max-w-2xl mx-auto text-lg px-3">
    <Head>
      <title>Next.js with Tailwind CSS and TypeScript</title>
      <meta charSet="utf-8" />
      <meta name="viewport" content="initial-scale=1.0, width=device-width" />
      <meta lang="en" />
    </Head>
    <header className="my-6">
      <nav>
        <ul className="list-none flex justify-center gap-6">
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/bookshelf">Bookshelf</Link>
          </li>
        </ul>
      </nav>
      <hr className="mt-6" />
    </header>
    <main>{children}</main>
    <footer className="my-6">
      <hr className="mb-6" />
      <p className="text-center text-gray-500">
        Start your project with Next.js, Tailwind CSS and TypeScript:
        <br />
        <Link href="https://github.com/vercel/next.js/tree/canary/examples/with-tailwindcss-typescript">
          view this example on GitHub
        </Link>
      </p>
    </footer>
  </div>
)

export default Layout
