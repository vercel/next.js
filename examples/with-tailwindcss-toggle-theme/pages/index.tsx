import type { NextPage } from 'next'
import Head from 'next/head'
import Image from 'next/image'
import { useTheme } from '../theme/ThemeProvider'

const Home: NextPage = () => {
  const theme = useTheme()
  return (
    <div className="flex dark:bg-black	dark:text-white min-h-screen flex-col items-center justify-center py-2">
      <Head>
        <title>Create Next App</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="flex w-full flex-1  flex-col items-center justify-center px-20 text-center">
        <button
          className="min-w-[10rem] shadow-md py-2 px-4 mb-4 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:ring-2  focus:ring-blue-500"
          onClick={() => theme.toggle()}
        >
          {theme.value === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <h1 className="text-6xl font-bold">
          Welcome to{' '}
          <a className="text-blue-600" href="https://nextjs.org">
            Next.js!
          </a>
        </h1>

        <p className="mt-3 text-2xl">
          Get started by editing{' '}
          <code className="rounded-md bg-gray-100 dark:bg-gray-700 p-3 font-mono text-lg">
            pages/index.tsx
          </code>
        </p>

        <div className="mt-6 flex max-w-4xl flex-wrap items-center justify-around sm:w-full dark:text-gray-400">
          <a
            href="https://nextjs.org/docs"
            className="mt-6 w-96 rounded-xl border  dark:border-gray-800 p-6 text-left hover:text-blue-600 focus:text-blue-600"
          >
            <h3 className="text-2xl font-bold">Documentation &rarr;</h3>
            <p className="mt-4 text-xl">
              Find in-depth information about Next.js features and API.
            </p>
          </a>

          <a
            href="https://nextjs.org/learn"
            className="mt-6 w-96 rounded-xl border dark:border-gray-800 p-6 text-left hover:text-blue-600 focus:text-blue-600"
          >
            <h3 className="text-2xl font-bold">Learn &rarr;</h3>
            <p className="mt-4 text-xl">
              Learn about Next.js in an interactive course with quizzes!
            </p>
          </a>

          <a
            href="https://github.com/vercel/next.js/tree/canary/examples"
            className="mt-6 w-96 rounded-xl border dark:border-gray-800 p-6 text-left hover:text-blue-600 focus:text-blue-600"
          >
            <h3 className="text-2xl font-bold">Examples &rarr;</h3>
            <p className="mt-4 text-xl">
              Discover and deploy boilerplate example Next.js projects.
            </p>
          </a>

          <a
            href="https://vercel.com/import?filter=next.js&utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            className="mt-6 w-96 rounded-xl border dark:border-gray-800 p-6 text-left hover:text-blue-600 focus:text-blue-600"
          >
            <h3 className="text-2xl font-bold">Deploy &rarr;</h3>
            <p className="mt-4 text-xl">
              Instantly deploy your Next.js site to a public URL with Vercel.
            </p>
          </a>
        </div>
      </main>

      <footer className="flex h-24 w-full items-center justify-center border-t dark:border-gray-800">
        <a
          className="flex items-center justify-center gap-2"
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{' '}
          <Image
            src={theme.value === 'dark' ? '/vercel-white.svg' : '/vercel.svg'}
            alt="Vercel Logo"
            width={72}
            height={16}
          />
        </a>
      </footer>
    </div>
  )
}

export default Home
