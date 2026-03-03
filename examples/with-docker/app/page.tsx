import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <header
        className="container mx-auto px-4 pt-16 pb-8 text-center"
        aria-labelledby="main-heading"
      >
        <h1 id="main-heading" className="text-5xl font-bold mb-4 text-black">
          Welcome to Next.js on <span className="text-blue-600">Docker</span>!
        </h1>
        <p className="text-xl text-zinc-600 max-w-2xl mx-auto">
          A production-ready example demonstrating how to Dockerize Next.js
          applications using standalone mode.
        </p>
      </header>
      <main className="container mx-auto px-4 pb-16 max-w-6xl">
        <section
          className="grid md:grid-cols-2 gap-8 mb-16"
          aria-label="Features"
        >
          <article className="bg-white rounded-lg p-8 shadow-lg border border-zinc-200">
            <h2 className="text-2xl font-semibold mb-4 text-black">
              Standalone Mode
            </h2>
            <p className="text-zinc-600 mb-4">
              This example showcases Next.js standalone output mode, which
              creates a minimal production build optimized for Docker
              containers.
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-600">
              <li>Multi-stage Docker build for optimal image size</li>
              <li>Production-ready configuration</li>
              <li>Security best practices (non-root user)</li>
              <li>BuildKit cache mounts for faster builds</li>
            </ul>
          </article>

          <article className="bg-white rounded-lg p-8 shadow-lg border border-zinc-200">
            <h2 className="text-2xl font-semibold mb-4 text-black">
              Quick Start
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Build the image:</p>
                <code className="block text-sm font-mono bg-zinc-100 p-3 rounded text-zinc-800 break-all">
                  docker build -t nextjs-standalone-image .
                </code>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Run the container:</p>
                <code className="block text-sm font-mono bg-zinc-100 p-3 rounded text-zinc-800 break-all">
                  docker run -p 3000:3000 nextjs-standalone-image
                </code>
              </div>
              <div className="pt-2 border-t border-zinc-200">
                <p className="text-sm text-zinc-600 mb-2">
                  Or use Docker Compose:
                </p>
                <code className="block text-sm font-mono bg-zinc-100 p-3 rounded text-zinc-800 break-all">
                  docker compose up
                </code>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span>Access at:</span>
                <code className="bg-zinc-100 px-2 py-1 rounded">
                  http://localhost:3000
                </code>
              </div>
            </div>
          </article>
        </section>

        <section className="mb-12" aria-labelledby="nextjs-resources-heading">
          <h2
            id="nextjs-resources-heading"
            className="text-2xl font-semibold mb-6 text-black text-center"
          >
            Next.js Resources
          </h2>
          <nav
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
            aria-label="Next.js resource links"
          >
            <Link
              href="https://nextjs.org/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-lg p-6 shadow-md border border-zinc-200 hover:shadow-lg transition-shadow group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Next.js documentation"
            >
              <h3 className="text-lg font-semibold mb-2 text-black group-hover:text-blue-600">
                Documentation →
              </h3>
              <p className="text-zinc-600 text-sm">
                Find in-depth information about Next.js features and API.
              </p>
            </Link>

            <Link
              href="https://vercel.com/templates?framework=next.js"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-lg p-6 shadow-md border border-zinc-200 hover:shadow-lg transition-shadow group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Browse Next.js templates"
            >
              <h3 className="text-lg font-semibold mb-2 text-black group-hover:text-blue-600">
                Templates →
              </h3>
              <p className="text-zinc-600 text-sm">
                Browse and deploy Next.js templates to get started quickly!
              </p>
            </Link>

            <Link
              href="https://github.com/vercel/next.js/tree/canary/examples"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-lg p-6 shadow-md border border-zinc-200 hover:shadow-lg transition-shadow group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="View Next.js examples"
            >
              <h3 className="text-lg font-semibold mb-2 text-black group-hover:text-blue-600">
                Examples →
              </h3>
              <p className="text-zinc-600 text-sm">
                Discover and deploy boilerplate example Next.js projects.
              </p>
            </Link>

            <Link
              href="https://vercel.com/new?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-lg p-6 shadow-md border border-zinc-200 hover:shadow-lg transition-shadow group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Deploy to Vercel"
            >
              <h3 className="text-lg font-semibold mb-2 text-black group-hover:text-blue-600">
                Deploy →
              </h3>
              <p className="text-zinc-600 text-sm">
                Instantly deploy your Next.js site to a public URL with Vercel.
              </p>
            </Link>
          </nav>
        </section>

        <section className="mb-16" aria-labelledby="docker-resources-heading">
          <h2
            id="docker-resources-heading"
            className="text-2xl font-semibold mb-6 text-black text-center"
          >
            Docker Resources
          </h2>
          <nav
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
            aria-label="Docker resource links"
          >
            <Link
              href="https://docs.docker.com/get-started/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-lg p-6 shadow-md border border-zinc-200 hover:shadow-lg transition-shadow group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Learn Docker fundamentals"
            >
              <h3 className="text-lg font-semibold mb-2 text-black group-hover:text-blue-600">
                Learn Docker →
              </h3>
              <p className="text-zinc-600 text-sm">
                Get started with Docker! Learn fundamentals, containerization,
                and deployment.
              </p>
            </Link>
            <Link
              href="https://docs.docker.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-lg p-6 shadow-md border border-zinc-200 hover:shadow-lg transition-shadow group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Browse Docker documentation"
            >
              <h3 className="text-lg font-semibold mb-2 text-black group-hover:text-blue-600">
                Docker Docs →
              </h3>
              <p className="text-zinc-600 text-sm">
                Comprehensive Docker documentation and reference guides.
              </p>
            </Link>

            <Link
              href="https://docs.docker.com/language/nodejs/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-lg p-6 shadow-md border border-zinc-200 hover:shadow-lg transition-shadow group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Read React.js Docker guide"
            >
              <h3 className="text-lg font-semibold mb-2 text-black group-hover:text-blue-600">
                React.js Guide →
              </h3>
              <p className="text-zinc-600 text-sm">
                Official Docker guide for React.js applications following best
                practices for containerization.
              </p>
            </Link>
          </nav>
        </section>

        <footer className="mt-16 pt-8 border-t border-gray-200">
          <div className="flex flex-col items-center justify-center gap-3 text-gray-600">
            <p className="text-sm">
              <Link
                href="https://nextjs.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-gray-900 hover:text-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                aria-label="Visit Next.js website"
              >
                <Image
                  src="/next.svg"
                  alt="Next.js"
                  width={197}
                  height={40}
                  className="h-5 w-auto"
                />
              </Link>
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
