import Link from 'next/link'

const Nav = () => {
  return (
    <nav>
      <Link href="/" legacyBehavior>
        <a>Index</a>
      </Link>
      <Link href="/ssg" legacyBehavior>
        <a>SSG</a>
      </Link>
      <Link href="/ssr" legacyBehavior>
        <a>SSR</a>
      </Link>
      <style jsx>
        {`
          a {
            margin-right: 25px;
          }
        `}
      </style>
    </nav>
  )
}

export default Nav
