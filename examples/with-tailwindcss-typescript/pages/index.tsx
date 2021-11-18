import Link from '../components/Link'

const Index: React.FC = () => (
  <>
    <h1>Hello Next.js 👋</h1>
    <p className="mb-3">
      This is an example website using Tailwind CSS and TypeScript.
    </p>
    <ul className="list-disc list-inside">
      <li>
        Browse the <Link href="/bookshelf">bookshelf</Link>
      </li>
      <li>
        See the source and installation instructions on{' '}
        <Link href="https://github.com/vercel/next.js/tree/canary/examples/with-tailwindcss-typescript">
          GitHub
        </Link>
      </li>
    </ul>
  </>
)

export default Index
