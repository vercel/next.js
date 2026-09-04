import { CMS_NAME, CMS_URL } from '@/lib/constants'

export default function Intro() {
  return (
    <section className="mb-16 mt-16 flex flex-col items-center md:mb-12 md:flex-row md:justify-between">
      <div className="md:pr-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-lg bg-primary-600 px-2 py-1 text-2xl font-bold text-white md:text-3xl">
            Acme
          </span>
          <span className="text-4xl font-bold tracking-tight text-secondary-700 md:text-5xl">
            Lease Blog
          </span>
        </div>
      </div>
      <h4 className="mt-5 text-center text-lg text-secondary-500 md:pl-8 md:text-left">
        Tips, guides and stories about car leasing — built with{' '}
        <a
          href="https://nextjs.org/"
          className="text-primary-600 underline transition-colors hover:text-primary-700"
        >
          Next.js
        </a>{' '}
        and{' '}
        <a
          href={CMS_URL}
          className="text-primary-600 underline transition-colors hover:text-primary-700"
        >
          {CMS_NAME}
        </a>
        .
      </h4>
    </section>
  )
}
