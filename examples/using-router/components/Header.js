import Router from 'next/router'

export default () => (
  <div>
    <Link href='/'><a>Home</a></Link>
    <Link href='/about'><a>About</a></Link>
    <Link href='/error'><a>Error</a></Link>
  </div>
)

// typically you want to use `next/link` for this usecase
// but this example shows how you can also access the router
// and use it manually
const Link = ({ children, href }) => (
  <a
    href='#'
    style={styles.a}
    onClick={(e) => {
      e.preventDefault()
      Router.push(href)
    }}
  >
    { children }
  </a>
)

const styles = {
  a: {
    marginRight: 10
  }
}
