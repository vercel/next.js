import Link from 'next/link'
import { useRouter } from 'next/router'

export default () => (
  <>
    <Link href="/other-page">
      <a id="other-page-link">
        <h1>Hello World</h1>
      </a>
    </Link>
    <div id="base-path">{useRouter().basePath}</div>
  </>
)
