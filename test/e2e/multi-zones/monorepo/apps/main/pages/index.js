import Link from 'next/link'
import CustomLink from '@acme/ui/link'

const IndexPage = () => (
  <>
    <h1 id="main-app">main app</h1>
    <ul>
      <li>
        <Link href="/" id="home-link">
          home
        </Link>
      </li>
      <li>
        <a href="/docs" id="docs-link">
          docs
        </a>
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
