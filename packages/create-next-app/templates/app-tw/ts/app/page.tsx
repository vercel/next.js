import Image from 'next/image'
import { Inter } from 'next/font/google'
import styles from './page.module.css'

const inter = Inter({ subsets: ['latin'] })

export default function Home() {
  return (
    <main className="flex flex-col justify-between items-center p-24 min-h-screen">
      <div
        className={`flex justify-between items-center text-sm w-full max-w-6xl z-10 font-mono`}
      >
        <p className="bg-gray-200 dark:bg-neutral-800 dark:bg-opacity-30 border border-gray-300 dark:border-neutral-800  p-4 rounded-xl">
          Get started by editing&nbsp;
          <code className="font-mono font-bold">app/page.tsx</code>
        </p>
        <div>
          <a
            className="flex gap-2 place-items-center"
            href="https://vercel.com?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            By{' '}
            <Image
              src="/vercel.svg"
              alt="Vercel Logo"
              className="dark:invert"
              width={100}
              height={24}
              priority
            />
          </a>
        </div>
      </div>

      <div className="flex place-items-center px-16">
        <Image
          className="relative dark:invert"
          src="/next.svg"
          alt="Next.js Logo"
          width={180}
          height={37}
          priority
        />
        <div className="relative flex justify-center items-center w-20 h-20 ml-4 rounded-xl shadow-lg dark:invert">
          <Image src="/thirteen.svg" alt="13" width={40} height={31} priority />
        </div>
      </div>

      <div className={styles.grid}>
        <a
          href="https://beta.nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          className="px-5 py-4 rounded-lg border-transparent transition-colors group hover:bg-gray-100 border hover:border-gray-300 hover:dark:bg-neutral-800 hover:dark:bg-opacity-30 hover:dark:border-neutral-700"
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2 className={`${inter.className} text-xl font-semibold mb-3`}>
            Docs{' '}
            <span className="group-hover:translate-x-1 inline-block transition-transform motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`${inter.className} m-0 opacity-50 text-sm max-w-lg`}>
            Find in-depth information about Next.js features and API.
          </p>
        </a>

        <a
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          className="px-5 py-4 rounded-lg border-transparent transition-colors group hover:bg-gray-100 border hover:border-gray-300 hover:dark:bg-neutral-800 hover:dark:bg-opacity-30 hover:dark:border-neutral-700"
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2 className={`${inter.className} text-xl font-semibold mb-3`}>
            Templates{' '}
            <span className="group-hover:translate-x-1 inline-block transition-transform motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`${inter.className} m-0 opacity-50 text-sm max-w-lg`}>
            Explore the Next.js 13 playground.
          </p>
        </a>

        <a
          href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          className="px-5 py-4 rounded-lg border-transparent transition-colors group hover:bg-gray-100 border hover:border-gray-300 hover:dark:bg-neutral-800 hover:dark:bg-opacity-30 hover:dark:border-neutral-700"
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2 className={`${inter.className} text-xl font-semibold mb-3`}>
            Deploy{' '}
            <span className="group-hover:translate-x-1 inline-block transition-transform motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`${inter.className} m-0 opacity-50 text-sm max-w-lg`}>
            Instantly deploy your Next.js site to a shareable URL with Vercel.
          </p>
        </a>
      </div>
    </main>
  )
}
