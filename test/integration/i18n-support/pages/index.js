import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useState } from 'react'

export default function Page(props) {
  const router = useRouter()
  const parsedAs = new URL(router.asPath, 'http://n')
  const [asPath, setAsPath] = useState(parsedAs.pathname)

  useEffect(() => {
    if (router.isReady && router.asPath && asPath !== router.asPath) {
      setAsPath(router.asPath)
    }
  }, [router.asPath, router.isReady, asPath])

  return (
    <>
      <p id="index">index page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router-locale">{router.locale}</p>
      <p id="router-default-locale">{router.defaultLocale}</p>
      <p id="router-locales">{JSON.stringify(router.locales)}</p>
      <p id="router-domain-locales">{JSON.stringify(router.domainLocales)}</p>
      <p id="router-query">{JSON.stringify(router.query)}</p>
      <p id="router-pathname">{router.pathname}</p>
      <p id="router-as-path">{asPath}</p>
      <Link href="/another" id="to-another">
        to /another
      </Link>
      <br />
      <Link href="/dynamic/first" id="to-dynamic">
        to /dynamic/first
      </Link>
      <br />
      <Link href="/gsp" id="to-gsp">
        to /gsp
      </Link>
      <br />
      <Link href="/gsp/fallback/first" id="to-fallback-first">
        to /gsp/fallback/first
      </Link>
      <br />
      <Link href="/gsp/fallback/hello" id="to-fallback-hello">
        to /gsp/fallback/hello
      </Link>
      <br />
      <Link href="/gsp/no-fallback/first" id="to-no-fallback-first">
        to /gsp/no-fallback/first
      </Link>
      <br />
      <Link href="/gssp" id="to-gssp">
        to /gssp
      </Link>
      <br />
      <Link href="/gssp/first" id="to-gssp-slug">
        to /gssp/first
      </Link>
      <br />
      <Link href="/api/post/asdf" id="to-api-post">
        to /api/post/[slug]
      </Link>
      <Link href="https://nextjs.org/" id="to-external">
        to https://nextjs.org/
      </Link>
      <br />
    </>
  )
}

export const getStaticProps = ({ locale, locales, defaultLocale }) => {
  return {
    props: {
      locale,
      locales,
      defaultLocale,
    },
  }
}
