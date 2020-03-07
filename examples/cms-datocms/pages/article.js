import Link from 'next/link'

export default () => {
  return (
    <>
      <div className="bg-accent-1 border-b border-accent-2">
        <div className="container mx-auto px-5 py-2 text-center text-sm">
          The source code for this blog is{' '}
          <a
            href="https://github.com/zeit/next.js/tree/canary/examples/cms-datocms"
            className="underline hover:text-success"
          >
            available on GitHub
          </a>
          .
        </div>
      </div>
      <div className="container mx-auto px-5 mt-8">
        <h2 className="text-2xl md:text-4xl font-bold tracking-tight md:tracking-tighter leading-tight mb-20">
          <Link href="/">
            <a className="hover:underline">Blog</a>
          </Link>
          .
        </h2>
        <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-tight md:leading-none mb-12 text-center md:text-left">
          Learn How to Pre-render Pages Using Static Generation with Next.js
        </h1>
        <div className="hidden md:flex items-center md:mb-12">
          <img
            src="/images/author.jpg"
            className="w-12 h-12 rounded-full mr-4 grayscale"
          />
          <div className="text-xl font-bold">Shu Uesugi</div>
        </div>
        <div className="mb-8 md:mb-16 -mx-5 sm:mx-0">
          <img src="/images/image.jpg" className="shadow-magical" />
        </div>
        <div className="max-w-2xl mx-auto mb-28">
          <div className="flex md:hidden items-center mb-6">
            <img
              src="/images/author.jpg"
              className="w-12 h-12 rounded-full mr-4 grayscale"
            />
            <div className="text-xl font-bold">Shu Uesugi</div>
          </div>
          <div className="text-lg mb-6">March 10, 2020</div>
          <p className="my-6 text-lg leading-relaxed">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Praesent
            elementum facilisis leo vel fringilla est ullamcorper eget. At
            imperdiet dui accumsan sit amet nulla facilisi morbi tempus.
            Praesent elementum facilisis leo vel fringilla. Congue mauris
            rhoncus aenean vel. Egestas sed tempus urna et pharetra pharetra
            massa massa ultricies.
          </p>
          <p className="my-6 text-lg leading-relaxed">
            Venenatis cras sed felis eget velit. Consectetur libero id faucibus
            nisl tincidunt. Gravida in fermentum et sollicitudin ac orci
            phasellus egestas tellus. Volutpat consequat mauris nunc congue nisi
            vitae. Id aliquet risus feugiat in ante metus dictum at tempor. Sed
            blandit libero volutpat sed cras. Sed odio morbi quis commodo odio
            aenean sed adipiscing. Velit euismod in pellentesque massa placerat.
            Mi bibendum neque egestas congue quisque egestas diam in arcu. Nisi
            lacus sed viverra tellus in. Nibh cras pulvinar mattis nunc sed.
            Luctus accumsan tortor posuere ac ut consequat semper viverra.
            Fringilla ut morbi tincidunt augue interdum velit euismod.
          </p>
          <h2 className="text-3xl mt-12 mb-4 leading-snug">Lorem Ipsum</h2>
          <p className="my-6 text-lg leading-relaxed">
            Tristique senectus et netus et malesuada fames ac turpis. Ridiculus
            mus mauris vitae ultricies leo integer malesuada nunc vel. In mollis
            nunc sed id semper. Egestas tellus rutrum tellus pellentesque.
            Phasellus vestibulum lorem sed risus ultricies tristique nulla. Quis
            blandit turpis cursus in hac habitasse platea dictumst quisque. Eros
            donec ac odio tempor orci dapibus ultrices. Aliquam sem et tortor
            consequat id porta nibh. Adipiscing elit duis tristique sollicitudin
            nibh sit amet commodo nulla. Diam vulputate ut pharetra sit amet. Ut
            tellus elementum sagittis vitae et leo. Arcu non odio euismod
            lacinia at quis risus sed vulputate.
          </p>
          <p className="my-6 text-lg leading-relaxed">
            Nunc mi ipsum faucibus vitae aliquet nec ullamcorper sit. Eu turpis
            egestas pretium aenean. Diam phasellus vestibulum lorem sed risus.
            Amet venenatis urna cursus eget nunc scelerisque viverra.
            Pellentesque habitant morbi tristique senectus et netus et. Luctus
            venenatis lectus magna fringilla urna. Interdum posuere lorem ipsum
            dolor. Nullam vehicula ipsum a arcu cursus vitae congue mauris.
            Tempor nec feugiat nisl pretium fusce id velit. Semper viverra nam
            libero justo laoreet sit amet cursus sit. A lacus vestibulum sed
            arcu non odio euismod lacinia. Fermentum dui faucibus in ornare.
            Imperdiet sed euismod nisi porta. Pulvinar sapien et ligula
            ullamcorper malesuada proin. Mauris rhoncus aenean vel elit
            scelerisque mauris pellentesque. Eget egestas purus viverra
            accumsan. Pellentesque id nibh tortor id aliquet.
          </p>
        </div>
        <hr className="border-accent-2 mb-24" />
        <div className="mb-8 text-6xl md:text-7xl font-bold tracking-tighter leading-tight">
          More Stories
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 md:col-gap-16 lg:col-gap-32 row-gap-20 md:row-gap-32 mb-32">
          <div>
            <div className="-mx-5 sm:mx-0">
              <img src="/images/image.jpg" className="mb-5 shadow-magical" />
            </div>
            <h3 className="text-3xl mb-3 leading-snug">
              Preview Mode for Static Generation
            </h3>
            <div className="text-lg mb-4">March 10, 2020</div>
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
            <div className="-mx-5 sm:mx-0">
              <img src="/images/image.jpg" className="mb-5 shadow-magical" />
            </div>
            <h3 className="text-3xl mb-3 leading-snug">
              Dynamic Routing and Static Generation
            </h3>
            <div className="text-lg mb-4">March 10, 2020</div>
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
          <div className="flex flex-col md:flex-row items-center">
            <h3 className="text-4xl lg:text-5xl font-bold tracking-tighter leading-tight text-center md:text-left mb-10 md:mb-0 md:pr-4 md:w-1/2">
              Statically Generated with Next.js.
            </h3>
            <div className="flex flex-col md:flex-row justify-center items-center md:pl-4 md:w-1/2">
              <a
                href="https://nextjs.org/docs/basic-features/pages"
                className="mx-3 bg-black hover:bg-white hover:text-black border border-black text-white font-bold py-3 px-24 md:px-10 duration-200 transition-colors mb-6 md:mb-0"
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
