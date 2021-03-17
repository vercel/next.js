import Link from 'next/link'
import { useRouter } from 'next/router'

export default () => (
  <>
    <Link href="/other-page">
      <a id="other-page-link">
        <h1>Hello World</h1>
      </a>
    </Link>
    <br />
    <Link href="/gsp">
      <a id="gsp-link">
        <h1>getStaticProps</h1>
      </a>
    </Link>
    <br />
    <Link href="/gssp">
      <a id="gssp-link">
        <h1>getServerSideProps</h1>
      </a>
    </Link>
    <br />
    <Link href="/[slug]" as="/first">
      <a id="dynamic-link">
        <h1>dynamic page</h1>
      </a>
    </Link>
    <br />
    <Link href="/catchall/[...parts]" as="/catchall/hello/world">
      <a id="catchall-link">
        <h1>catchall page</h1>
      </a>
    </Link>
    <br />
    <Link href="/">
      <a id="index-gsp">
        <h1>index getStaticProps</h1>
      </a>
    </Link>
    <br />
    <Link href="/index">
      <a id="nested-index-gsp">
        <h1>nested index getStaticProps</h1>
      </a>
    </Link>
    <Link href="#hashlink">
      <a id="hashlink">Hash Link</a>
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
    <Link href="/slow-route">
      <a id="slow-route">
        <h1>Slow route</h1>
      </a>
    </Link>
    <Link href="/error-route">
      <a id="error-route">
        <h1>Error route</h1>
      </a>
    </Link>
    <Link href="/hello#some-hash">
      <a id="hash-change">
        <h1>Hash change</h1>
      </a>
    </Link>
    <Link href="/something-else" as="/hello">
      <a id="something-else-link">to something else</a>
    </Link>
  </>
)
