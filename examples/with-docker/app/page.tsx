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

            <Link
              href="https://github.com/kristiyan-velkov/frontend-prod-dockerfiles"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-lg p-6 shadow-md border border-zinc-200 hover:shadow-lg transition-shadow group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Learn Docker best practices"
            >
              <h3 className="text-lg font-semibold mb-2 text-black group-hover:text-blue-600">
                Front-end Production Dockerfiles →
              </h3>
              <p className="text-zinc-600 text-sm">
                Production-ready Dockerfiles for React.js, Angular, Vue.js,
                Next.js, Nuxt.js and more applications.
              </p>
            </Link>
          </nav>
        </section>

        <aside
          className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-xl p-6 border border-blue-200 shadow-md"
          aria-label="About the author"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="text-center md:text-left">
              <div className="mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 block">
                  Author
                </span>
                <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Kristiyan Velkov
                </h3>
              </div>
              <p className="text-sm text-zinc-600 font-medium">
                Docker Captain • Speaker • Open Source Contributor
              </p>
            </div>
            <nav
              className="flex flex-wrap justify-center md:justify-end gap-3"
              aria-label="Social media links"
            >
              <Link
                href="https://kristiyanvelkov.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-indigo-600 hover:bg-indigo-50 font-medium transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                aria-label="Visit Kristiyan Velkov's website"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                  />
                </svg>
                Website
              </Link>
              <Link
                href="https://www.linkedin.com/in/kristiyan-velkov-763130b3/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-blue-600 hover:bg-blue-50 font-medium transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="Visit Kristiyan Velkov's LinkedIn profile"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                LinkedIn
              </Link>
              <Link
                href="https://github.com/kristiyan-velkov"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-zinc-800 hover:bg-zinc-50 font-medium transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="Visit Kristiyan Velkov's GitHub profile"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
                GitHub
              </Link>
              <Link
                href="https://x.com/krisvelkov"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-zinc-800 hover:bg-zinc-50 font-medium transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="Visit Kristiyan Velkov's X (Twitter) profile"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Twitter
              </Link>
            </nav>
          </div>
        </aside>

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
