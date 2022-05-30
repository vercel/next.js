import ActiveLink from './ActiveLink'

const Nav = () => (
  <nav>
    <style jsx>{`
      .nav-link {
        text-decoration: none;
      }

      .active:after {
        content: ' (current page)';
      }
    `}</style>
    <ul className="nav">
      <li>
        <ActiveLink activeClassName="active" href="/">
          <a className="nav-link">Home</a>
        </ActiveLink>
      </li>
      <li>
        <ActiveLink activeClassName="active" href="/about">
          <a className="nav-link">About</a>
        </ActiveLink>
      </li>
      <li>
        <ActiveLink activeClassName="active" href="/blog">
          <a className="nav-link">Blog</a>
        </ActiveLink>
      </li>
      <li>
        <ActiveLink activeClassName="active" href="/[slug]" as="/dynamic-route">
          <a className="nav-link">Dynamic Route</a>
        </ActiveLink>
      </li>
    </ul>
  </nav>
)

export default Nav
