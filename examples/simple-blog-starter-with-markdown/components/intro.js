export default function Intro() {
  return (
    <section className="flex-col flex md:justify-between mt-16 mb-12 md:mb-24">
      <h1 className="text-4xl md:text-6xl font-bold tracking-tighter leading-tight md:pr-8">
        Next.js Simple Blog Starter.
      </h1>
      <h4 className="text-sm mt-2 md:text-lg md:text-left leading-tight">
        A statically generated blog example using{' '}
        <a
          href="https://nextjs.org/"
          className="underline hover:text-success duration-200 transition-colors"
        >
          Next.js
        </a>{' '}
        and Markdown.
      </h4>
    </section>
  )
}
