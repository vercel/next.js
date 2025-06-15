import LocaleSelector from '@/components/LocaleSelector';
import Image from "next/image";
import { T } from 'gt-next';

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <h1 className="title">
          General Translation, Inc.
        </h1>
        <T>
        <ol className="list-inside list-decimal text-sm text-center sm:text-left font-[family-name:var(--font-geist-mono)]">
          <li className="mb-2">This is a multilingual Next.js app created with <code className="bg-black/[.05] dark:bg-white/[.06] px-1 py-0.5 rounded font-semibold">
             create-next-app
            </code> and <code className="bg-black/[.05] dark:bg-white/[.06] px-1 py-0.5 rounded font-semibold">
             gt-next
            </code>.</li>
          <li className="mb-2">
            It&apos;s deployed in 20 different languages!
          </li>
          <li>Select a language from the dropdown below.</li>
        </ol>
        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <div className="text-black">
            <LocaleSelector/>
          </div>
          <a
            className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:min-w-44"
            href="https://generaltranslation.com/docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            gt-next docs
          </a>
        </div>
        </T>
      </main>
      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center">
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://generaltranslation.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/globe.svg"
            alt="Globe icon"
            width={16}
            height={16}
          />
          generaltranslation.com
        </a>
      </footer>
    </div>
  );
}
