import Link from 'next/link'
import ConnectButton from '@/components/ConnectButton'
import Withdraw from '@/components/Withdraw'

export default function Page() {
  return (
    <div className="container">
      <main>
        <h1 className="title">
          Welcome to <a href="https://nextjs.org">Next.js with Thirdweb!</a>
        </h1>

        <p className="description">
          Get started by editing <code>app/page.tsx</code>
        </p>
        <div className="card">
          <p className="description">
            Interact with the Lock smart contract by connecting to wallet
          </p>
          <div className="row">
            <ConnectButton />
            <Withdraw />
          </div>
        </div>
        <div className="grid">
          <Link href="https://nextjs.org/docs" className="card">
            <h3>Documentation &rarr;</h3>
            <p>Find in-depth information about Next.js features and API.</p>
          </Link>
          <Link href="https://portal.thirdweb.com/react/v4" className="card">
            <h3>Documentation &rarr;</h3>
            <p>Find in-depth information about Thirdweb features and API.</p>
          </Link>

          <Link href="https://nextjs.org/learn" className="card">
            <h3>Learn &rarr;</h3>
            <p>Learn about Next.js in an interactive course with quizzes!</p>
          </Link>

          <Link
            href="https://github.com/vercel/next.js/tree/canary/examples"
            className="card"
          >
            <h3>Examples &rarr;</h3>
            <p>Discover and deploy boilerplate example Next.js projects.</p>
          </Link>

          <Link
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
            className="card"
          >
            <h3>Deploy &rarr;</h3>
            <p>
              Instantly deploy your Next.js site to a public URL with Vercel.
            </p>
          </Link>
        </div>
      </main>

      <footer>
        <Link
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{' '}
          <img src="/vercel.svg" alt="Vercel Logo" className="logo" />
        </Link>
      </footer>
    </div>
  )
}
