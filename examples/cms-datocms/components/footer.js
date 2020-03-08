import Container from './container'

export default function Footer() {
  return (
    <footer className="bg-accent-1 border-t border-accent-2">
      <Container>
        <div className="py-28 flex flex-col md:flex-row items-center">
          <h3 className="text-4xl lg:text-5xl font-bold tracking-tighter leading-tight text-center md:text-left mb-10 md:mb-0 md:pr-4 md:w-1/2">
            Statically Generated with Next.js.
          </h3>
          <div className="flex flex-col md:flex-row justify-center items-center md:pl-4 md:w-1/2">
            <a
              href="https://nextjs.org/docs/basic-features/pages"
              className="mx-3 bg-black hover:bg-white hover:text-black border border-black text-white font-bold py-3 px-24 md:px-10 duration-200 transition-colors mb-6 md:mb-0"
            >
              Read Documentation
            </a>
            <a
              href="https://github.com/zeit/next.js/tree/canary/examples/cms-datocms"
              className="mx-3 font-bold hover:underline"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </Container>
    </footer>
  )
}
