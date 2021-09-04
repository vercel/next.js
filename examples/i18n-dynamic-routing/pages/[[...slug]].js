import { useRouter } from 'next/router'
import Link from 'next/link'
import { getPages, getPage } from '../lib/cms'

export default function Page({ links, page }) {
  const { locales, locale, asPath } = useRouter()

  return (
    <div className="container">
      <header>
        {locales.map((l) => (
          <Link key={`link-${l}`} locale={l} href="/">
            <a className={l === locale ? 'active' : undefined}>{l}</a>
          </Link>
        ))}
        <hr />
        {links.map((link) => (
          <Link key={`link-${link.href}`} href={link.href}>
            <a className={asPath === link.href ? 'active' : undefined}>
              {link.label}
            </a>
          </Link>
        ))}
      </header>
      <main>
        <h1>{page.title}</h1>
        <h2>{page.slug}</h2>
      </main>
      <style jsx>{`
        * {
          color: black;
        }

        .container {
          margin: 50px;
        }

        a {
          display: inline-block;
          padding: 10px 20px 10px 0;
          text-decoration: none;
          color: grey;
        }

        a.active {
          font-weight: bold;
          text-decoration: underline;
          color: black;
        }
      `}</style>
    </div>
  )
}

export async function getStaticProps({ locale, params: { slug } }) {
  const currentPage = await getPage({
    slug: slug ? `/${slug.join('/')}` : '/',
    locale,
  })

  const page = {
    slug: currentPage.slug[locale],
    title: currentPage.title[locale],
  }

  const pages = getPages({ locale })

  const links = pages.map((page) => ({
    label: page.title[locale],
    href: page.slug[locale],
  }))

  return {
    props: {
      links,
      page,
    },
    notFound: !!!page,
  }
}

export async function getStaticPaths({ locales }) {
  const paths = []

  locales.forEach((locale) => {
    getPages({ locale }).forEach((page) => {
      const slug = page.slug[locale]
      const [, ...slugParts] = slug.split('/')

      paths.push({
        locale,
        params: {
          slug: slug === '/' ? null : slugParts,
        },
      })
    })
  })

  return {
    paths: paths,
    fallback: false,
  }
}
