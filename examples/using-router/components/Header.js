import Router from 'next/router'

export default () => (
  <div>
    <Link href='/'>Home</Link>
    <Link href='/about'>About</Link>
    <Link href='/error'>Error</Link>
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
