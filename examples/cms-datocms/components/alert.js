export default function Alert() {
  return (
    <div className="bg-accent-1 border-b border-accent-2">
      <div className="container mx-auto px-5 py-2 text-center text-sm">
        The source code for this blog is{' '}
        <a
          href="https://github.com/zeit/next.js/tree/canary/examples/cms-datocms"
          className="underline hover:text-success duration-200 transition-colors"
        >
          available on GitHub
        </a>
        .
      </div>
    </div>
  )
}
