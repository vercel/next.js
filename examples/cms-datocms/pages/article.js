import Link from 'next/link'
import Alert from '../components/alert'
import Footer from '../components/footer'
import Avatar from '../components/avatar'
import Date from '../components/date'
import Container from '../components/container'
import P from '../components/p'
import H2 from '../components/H2'
import MoreStories from '../components/more-stories'

export default function Article() {
  return (
    <div className="min-h-screen bg-accent-1">
      <Alert />
      <div className="bg-white py-px">
        <div className="mt-8">
          <Container>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight md:tracking-tighter leading-tight mb-20">
              <Link href="/">
                <a className="hover:underline">Blog</a>
              </Link>
              .
            </h2>
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-tight md:leading-none mb-12 text-center md:text-left">
              Deploying Next.js Apps
            </h1>
            <div className="hidden md:block md:mb-12">
              <Avatar />
            </div>
            <div className="mb-8 md:mb-16 -mx-5 sm:mx-0">
              <img src="/images/image.jpg" className="shadow-magical" />
            </div>
            <div className="max-w-2xl mx-auto mb-28">
              <div className="block md:hidden mb-6">
                <Avatar />
              </div>
              <div className="mb-6">
                <Date />
              </div>
              <P>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                eiusmod tempor incididunt ut labore et dolore magna aliqua.
                Praesent elementum facilisis leo vel fringilla est ullamcorper
                eget. At imperdiet dui accumsan sit amet nulla facilisi morbi
                tempus. Praesent elementum facilisis leo vel fringilla. Congue
                mauris rhoncus aenean vel. Egestas sed tempus urna et pharetra
                pharetra massa massa ultricies.
              </P>
              <P>
                Venenatis cras sed felis eget velit. Consectetur libero id
                faucibus nisl tincidunt. Gravida in fermentum et sollicitudin ac
                orci phasellus egestas tellus. Volutpat consequat mauris nunc
                congue nisi vitae. Id aliquet risus feugiat in ante metus dictum
                at tempor. Sed blandit libero volutpat sed cras. Sed odio morbi
                quis commodo odio aenean sed adipiscing. Velit euismod in
                pellentesque massa placerat. Mi bibendum neque egestas congue
                quisque egestas diam in arcu. Nisi lacus sed viverra tellus in.
                Nibh cras pulvinar mattis nunc sed. Luctus accumsan tortor
                posuere ac ut consequat semper viverra. Fringilla ut morbi
                tincidunt augue interdum velit euismod.
              </P>
              <H2>Lorem Ipsum</H2>
              <P>
                Tristique senectus et netus et malesuada fames ac turpis.
                Ridiculus mus mauris vitae ultricies leo integer malesuada nunc
                vel. In mollis nunc sed id semper. Egestas tellus rutrum tellus
                pellentesque. Phasellus vestibulum lorem sed risus ultricies
                tristique nulla. Quis blandit turpis cursus in hac habitasse
                platea dictumst quisque. Eros donec ac odio tempor orci dapibus
                ultrices. Aliquam sem et tortor consequat id porta nibh.
                Adipiscing elit duis tristique sollicitudin nibh sit amet
                commodo nulla. Diam vulputate ut pharetra sit amet. Ut tellus
                elementum sagittis vitae et leo. Arcu non odio euismod lacinia
                at quis risus sed vulputate.
              </P>
            </div>
            <hr className="border-accent-2 mb-24" />
            <MoreStories
              posts={[
                {
                  title: 'Preview Mode for Static Generation',
                },
                {
                  title: 'Dynamic Routing and Static Generation',
                },
              ]}
            />
          </Container>
        </div>
      </div>
      <Footer />
    </div>
  )
}
