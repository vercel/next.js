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
    <div id="base-path">{useRouter().basePath}</div>
    <div id="pathname">{useRouter().pathname}</div>
  </>
)
