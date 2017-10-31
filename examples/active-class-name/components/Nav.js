import Link from './Link'

export default () => (
  <nav>
    <style jsx>{`
      .active:after {
        content: ' (current page)';
      }

      .nav-link {
        text-decoration: none;
        padding: 10px;
        display: block;
      }
    `}</style>

    <ul>
      <li>
        <Link activeClassName='active' href='/'>
          <a className='nav-link home-link'>Home</a>
        </Link>
      </li>
      <li>
        <Link activeClassName='active' href='/about'>
          <a className='nav-link'>About</a>
        </Link>
      </li>
    </ul>
  </nav>
)
