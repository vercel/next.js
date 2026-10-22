import Container from './container'
import { CMS_NAME, CMS_URL } from '@/lib/constants'

export default function Footer() {
  return (
    <footer className="border-t border-secondary-300 bg-secondary-100">
      <Container>
        <div className="flex flex-col items-center py-28 lg:flex-row">
          <h3 className="mb-10 text-center text-3xl font-bold leading-tight tracking-tight text-secondary-700 lg:mb-0 lg:w-1/2 lg:pr-4 lg:text-left lg:text-4xl">
            The Acme Lease blog, powered by {CMS_NAME}.
          </h3>
          <div className="flex flex-col items-center justify-center lg:w-1/2 lg:flex-row lg:pl-4">
            <a
              href={CMS_URL}
              className="mx-3 mb-6 bg-primary-600 px-12 py-3 font-bold text-white transition-colors hover:bg-primary-700 lg:mb-0 lg:px-8"
            >
              Learn about Prepr
            </a>
            <a
              href="https://github.com/preprio/acme-lease"
              className="mx-3 font-bold text-secondary-700 hover:underline"
            >
              View Acme Lease on GitHub
            </a>
          </div>
        </div>
      </Container>
    </footer>
  )
}
