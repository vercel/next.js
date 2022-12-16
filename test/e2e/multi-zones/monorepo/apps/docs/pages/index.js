import Link from 'next/link'
import CustomLink from '@acme/ui/link'

const IndexPage = () => (
  <>
    <h1 id="docs-app">docs app</h1>
    <ul>
      <li>
        <a href="/" id="home-link">
          home
        </a>
      </li>
      <li>
        <Link href="/" id="docs-link">
          docs
        </Link>
      </li>
      <li>
        <CustomLink href="/about" id="about-link-module">
          about
        </CustomLink>
      </li>
    </ul>
  </>
)

export default IndexPage
