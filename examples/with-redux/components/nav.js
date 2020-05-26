// This is not client side routing and is done to demonstrate initial state in ssr/ssg.
// Use 'Link' from 'next/link' in production apps.
const Nav = () => {
  return (
    <nav>
      <a href="/">Index</a>
      <a href="/ssr">SSR</a>
      <a href="/ssg">SSG</a>
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
