import Alert from '../components/alert'
import Footer from '../components/footer'
import Avatar from '../components/avatar'
import Date from '../components/date'
import Container from '../components/container'
import textStyles from '../components/text-styles.module.css'
import cn from 'classnames'

export default function Index() {
  return (
    <div className="min-h-screen bg-accent-1">
      <Alert />
      <div className="bg-white py-px">
        <div className="mt-16">
          <Container>
            <div className="flex-col md:flex-row flex items-center md:justify-between mb-16 md:mb-12">
              <h1 className="text-6xl md:text-8xl font-bold tracking-tighter leading-tight md:pr-8">
                Blog.
              </h1>
              <h4 className="text-center md:text-left text-lg mt-5 md:pl-8">
                A statically generated blog example using{' '}
                <a
                  href="https://nextjs.org/"
                  className="underline hover:text-success duration-200 transition-colors"
                >
                  Next.js
                </a>{' '}
                and{' '}
                <a
                  href="https://www.datocms.com/"
                  className="underline hover:text-success duration-200 transition-colors"
                >
                  DatoCMS
                </a>
                .
              </h4>
            </div>
            <div className="mb-8 md:mb-16 -mx-5 sm:mx-0">
              <img src="/images/image.jpg" className="shadow-magical" />
            </div>
            <div className="md:grid md:grid-cols-2 md:col-gap-16 lg:col-gap-8 mb-20 md:mb-28">
              <div>
                <h3 className="mb-4 text-4xl lg:text-6xl leading-tight">
                  Learn How to Pre-render Pages Using Static Generation with
                  Next.js
                </h3>
                <div className="mb-4 md:mb-0">
                  <Date />
                </div>
              </div>
              <p className={cn(textStyles['body-text'], 'mb-4')}>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                eiusmod tempor incididunt ut labore et dolore magna aliqua.
                Praesent elementum facilisis leo vel fringilla est ullamcorper
                eget. At imperdiet dui accumsan sit amet nulla facilisi morbi
                tempus.
              </p>
              <Avatar />
            </div>
            <div className="mb-8 text-6xl md:text-7xl font-bold tracking-tighter leading-tight">
              More Stories
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 md:col-gap-16 lg:col-gap-32 row-gap-20 md:row-gap-32 mb-32">
              <div>
                <div className="-mx-5 sm:mx-0">
                  <img
                    src="/images/image.jpg"
                    className="mb-5 shadow-magical"
                  />
                </div>
                <h3 className="text-3xl mb-3 leading-snug">
                  Preview Mode for Static Generation
                </h3>
                <div className="text-lg mb-4 text-accent-5">
                  <Date />
                </div>
                <p className={cn(textStyles['body-text'], 'mb-4')}>
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed
                  do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                  Praesent elementum facilisis leo vel fringilla est ullamcorper
                  eget. At imperdiet dui accumsan sit amet nulla facilisi morbi
                  tempus.
                </p>
                <Avatar />
              </div>
              <div>
                <div className="-mx-5 sm:mx-0">
                  <img
                    src="/images/image.jpg"
                    className="mb-5 shadow-magical"
                  />
                </div>
                <h3 className="text-3xl mb-3 leading-snug">
                  Dynamic Routing and Static Generation
                </h3>
                <div className="text-lg mb-4 text-accent-5">
                  <Date />
                </div>
                <p className={cn(textStyles['body-text'], 'mb-4')}>
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed
                  do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                  Praesent elementum facilisis leo vel fringilla est ullamcorper
                  eget. At imperdiet dui accumsan sit amet nulla facilisi morbi
                  tempus.
                </p>
                <Avatar />
              </div>
              <div>
                <div className="-mx-5 sm:mx-0">
                  <img
                    src="/images/image.jpg"
                    className="mb-5 shadow-magical"
                  />
                </div>
                <h3 className="text-3xl mb-3 leading-snug">
                  Deploying Next.js Apps
                </h3>
                <div className="text-lg mb-4 text-accent-5">
                  <Date />
                </div>
                <p className={cn(textStyles['body-text'], 'mb-4')}>
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed
                  do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                  Praesent elementum facilisis leo vel fringilla est ullamcorper
                  eget. At imperdiet dui accumsan sit amet nulla facilisi morbi
                  tempus.
                </p>
                <Avatar />
              </div>
              <div>
                <div className="-mx-5 sm:mx-0">
                  <img
                    src="/images/image.jpg"
                    className="mb-5 shadow-magical"
                  />
                </div>
                <h3 className="text-3xl mb-3 leading-snug">
                  From Server-side Rendering to Static Generation
                </h3>
                <div className="text-lg mb-4 text-accent-5">
                  <Date />
                </div>
                <p className={cn(textStyles['body-text'], 'mb-4')}>
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed
                  do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                  Praesent elementum facilisis leo vel fringilla est ullamcorper
                  eget. At imperdiet dui accumsan sit amet nulla facilisi morbi
                  tempus.
                </p>
                <Avatar />
              </div>
            </div>
          </Container>
        </div>
      </div>
      <Footer />
    </div>
  )
}
