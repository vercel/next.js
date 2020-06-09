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
    <div id="base-path">{useRouter().basePath}</div>
    <div id="pathname">{useRouter().pathname}</div>
  </>
)
