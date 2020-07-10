import Link from 'next/link'
import { EXAMPLE_PATH } from '@/lib/constants'
import { getLegalPages } from '@/lib/shop-utils'
import Container from './container'

export default function Footer({ shop, pages }) {
  const legalPages = getLegalPages(shop)

  return (
    <footer className="bg-accent-1 border-t border-accent-2 mt-32">
      <Container>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 py-16">
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-8">
            <div className="mt-4">
              <h4 className="leading-5 font-semibold tracking-wider text-black uppercase">
                Navigate
              </h4>
              <ul className="mt-4">
                <li>
                  <Link href="/">
                    <a className="text-accent-5 font-medium hover:text-black">
                      Home
                    </a>
                  </Link>
                </li>

                {pages.edges.map(({ node }) => (
                  <li key={node.handle} className="mt-4">
                    <Link href="/pages/[page]" as={`/pages/${node.handle}`}>
                      <a className="text-accent-5 font-medium hover:text-black">
                        {node.title}
                      </a>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {legalPages.length > 0 && (
              <div className="mt-4">
                <h4 className="leading-5 font-semibold tracking-wider text-black uppercase">
                  Legal
                </h4>
                <ul>
                  {legalPages.map(({ title, handle }) => (
                    <li key={handle} className="mt-4">
                      <Link href="/legal/[page]" as={`/legal/${handle}`}>
                        <a className="text-accent-5 font-medium hover:text-black">
                          {title}
                        </a>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <h3 className="text-4xl lg:text-5xl font-bold tracking-tighter leading-tight text-left mb-10">
              Statically Generated with Next.js.
            </h3>
            <div className="flex flex-col lg:flex-row lg:items-center text-center">
              <a
                href="https://nextjs.org/docs/basic-features/pages"
                className="bg-black hover:bg-white hover:text-black border border-black text-white font-bold py-3 px-12 lg:px-8 duration-200 transition-colors mb-6 lg:mr-6 lg:mb-0"
              >
                Read Documentation
              </a>
              <a
                href={`https://github.com/zeit/next.js/tree/canary/examples/${EXAMPLE_PATH}`}
                className="font-bold hover:underline"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </Container>
    </footer>
  )
}
