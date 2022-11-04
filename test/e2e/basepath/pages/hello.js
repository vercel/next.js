import Link from 'next/link'
import { useRouter } from 'next/router'

const Page = () => (
  <>
    <Link href="/other-page" id="other-page-link">
      <h1>Hello World</h1>
    </Link>
    <br />
    <Link href="/gsp" id="gsp-link">
      <h1>getStaticProps</h1>
    </Link>
    <br />
    <Link href="/gssp" id="gssp-link">
      <h1>getServerSideProps</h1>
    </Link>
    <br />
    <Link href="/[slug]" as="/first" id="dynamic-link">
      <h1>dynamic page</h1>
    </Link>
    <br />
    <Link
      href="/catchall/[...parts]"
      as="/catchall/hello/world"
      id="catchall-link"
    >
      <h1>catchall page</h1>
    </Link>
    <br />
    <Link href="/" id="index-gsp">
      <h1>index getStaticProps</h1>
    </Link>
    <br />
    <Link href="/index" id="nested-index-gsp">
      <h1>nested index getStaticProps</h1>
    </Link>
    <Link href="#hashlink" id="hashlink">
      Hash Link
    </Link>
    <br />
    <div id="base-path">{useRouter().basePath}</div>
    <div id="pathname">{useRouter().pathname}</div>
    <div
      id="trigger-error"
      onClick={() => {
        throw new Error('oops heres an error')
      }}
    >
      click me for error
    </div>
    <br />
    <div id="as-path">{useRouter().asPath}</div>
    <Link href="/slow-route" id="slow-route">
      <h1>Slow route</h1>
    </Link>
    <Link href="/error-route" id="error-route">
      <h1>Error route</h1>
    </Link>
    <Link href="/hello#some-hash" id="hash-change">
      <h1>Hash change</h1>
    </Link>
    <Link href="/something-else" as="/hello" id="something-else-link">
      to something else
    </Link>
  </>
)
export default Page
