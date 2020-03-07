export default () => {
  return (
    <>
      <div className="bg-accent-1 border-b border-accent-2">
        <div className="container mx-auto px-5 py-2 text-center text-sm">
          The source code for this page is{' '}
          <a
            href="https://github.com/zeit/next.js/tree/canary/examples/cms-datocms"
            className="underline hover:text-success"
          >
            available on GitHub
          </a>
          .
        </div>
      </div>
      <div className="container mx-auto px-5 mt-16">
        <div className="flex items-center justify-between mb-12">
          <h1 className="text-7xl font-bold tracking-tighter leading-tight">
            Blog.
          </h1>
          <h4 className="text-lg mt-5">
            A statically generated blog example using{' '}
            <a
              href="https://nextjs.org/"
              className="underline hover:text-success"
            >
              Next.js
            </a>{' '}
            and{' '}
            <a
              href="https://www.datocms.com/"
              className="underline hover:text-success"
            >
              DatoCMS
            </a>
            .
          </h4>
        </div>
        <div className="mb-16">
          <img src="/images/image.jpg" className="shadow-magical" />
        </div>
        <div className="grid grid-cols-2 col-gap-8 mb-28">
          <div>
            <h3 className="text-5xl leading-tight">
              Learn how to pre-render pages using Static Generation using
              Next.js
            </h3>
          </div>
          <div>
            <p className="text-lg leading-relaxed mb-5">
              Lorem Ipsum is simply dummy text of the printing and typesetting
              industry. Lorem Ipsum has been the industry's standard dummy text
              ever since the 1500s, when an unknown printer took a galley of
              type and scrambled it to make a type specimen book.
            </p>
            <div className="flex items-center">
              <img
                src="/images/author.jpg"
                className="w-12 h-12 rounded-full mr-4 grayscale"
              />
              <div className="text-xl font-bold">Shu Uesugi</div>
            </div>
          </div>
        </div>
        <div className="mb-8 text-6xl font-bold tracking-tighter leading-tight">
          More Stories
        </div>
        <div className="grid grid-cols-2 col-gap-32 row-gap-32 mb-32">
          <div>
            <img src="/images/image.jpg" className="mb-5" />
            <h3 className="text-3xl mb-3">
              Preview Mode for Static Generation
            </h3>
            <p className="text-lg mb-4">
              Contrary to popular belief, Lorem Ipsum is not simply random text.
              It has roots in a piece of classical Latin literature from 45 BC,
              making it over 2000 years old.
            </p>
            <div className="flex items-center">
              <img
                src="/images/author.jpg"
                className="w-12 h-12 rounded-full mr-4 grayscale"
              />
              <div className="text-xl font-bold">Shu Uesugi</div>
            </div>
          </div>
          <div>
            <img src="/images/image.jpg" className="mb-5" />
            <h3 className="text-3xl mb-3">
              Dynamic Routing and Static Generation
            </h3>
            <p className="text-lg mb-4">
              Contrary to popular belief, Lorem Ipsum is not simply random text.
              It has roots in a piece of classical Latin literature from 45 BC,
              making it over 2000 years old.
            </p>
            <div className="flex items-center">
              <img
                src="/images/author.jpg"
                className="w-12 h-12 rounded-full mr-4 grayscale"
              />
              <div className="text-xl font-bold">Shu Uesugi</div>
            </div>
          </div>
          <div>
            <img src="/images/image.jpg" className="mb-5" />
            <h3 className="text-3xl mb-3">
              Preview Mode for Static Generation
            </h3>
            <p className="text-lg mb-4">
              Contrary to popular belief, Lorem Ipsum is not simply random text.
              It has roots in a piece of classical Latin literature from 45 BC,
              making it over 2000 years old.
            </p>
            <div className="flex items-center">
              <img
                src="/images/author.jpg"
                className="w-12 h-12 rounded-full mr-4 grayscale"
              />
              <div className="text-xl font-bold">Shu Uesugi</div>
            </div>
          </div>
          <div>
            <img src="/images/image.jpg" className="mb-5" />
            <h3 className="text-3xl mb-3">
              Preview Mode for Static Generation
            </h3>
            <p className="text-lg mb-4">
              Contrary to popular belief, Lorem Ipsum is not simply random text.
              It has roots in a piece of classical Latin literature from 45 BC,
              making it over 2000 years old.
            </p>
            <div className="flex items-center">
              <img
                src="/images/author.jpg"
                className="w-12 h-12 rounded-full mr-4 grayscale"
              />
              <div className="text-xl font-bold">Shu Uesugi</div>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-accent-1 border-t border-accent-2">
        <div className="container mx-auto px-5 py-28">
          <div className="flex items-center">
            <h3 className="text-4xl font-bold tracking-tighter leading-tight mr-4">
              Statically Generated using Next.js.
            </h3>
            <div className="flex-1 flex justify-center items-center">
              <a
                href="https://nextjs.org/docs/basic-features/pages"
                className="mx-3 bg-black hover:bg-white hover:text-black border border-black text-white font-bold py-3 px-10 duration-200 transition-colors"
              >
                Learn More
              </a>
              <a
                href="https://github.com/zeit/next.js/tree/canary/examples/cms-datocms"
                className="mx-3 font-bold hover:underline"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
