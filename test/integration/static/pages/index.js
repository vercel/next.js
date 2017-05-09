import Link from 'next/link'
import Router from 'next/router'

function routeToAbout (e) {
  e.preventDefault()
  Router.push('/about')
}

export default () => (
  <div id='home-page'>
    <div>
      <Link href='/about' id='about-via-link'>
        <a>About via Link</a>
      </Link>
      <a
        href='#'
        onClick={routeToAbout}
        id='about-via-router'
      >
        About via Router
      </a>
      <Link href='/counter' id='counter'>
        <a>Counter</a>
      </Link>
      <Link
        href='/dynamic?text=cool+dynamic+text'
        id='get-initial-props'
      >
        <a>getInitialProps</a>
      </Link>
      <Link
        href='/dynamic?text=next+export+is+nice'
        as='/dynamic/one'
        id='dynamic-1'
      >
        <a>Dynamic 1</a>
      </Link>
      <Link
        href='/dynamic?text=zeit+is+awesome'
        as='/dynamic/two'
        id='dynamic-2'
      >
        <a>Dynamic 2</a>
      </Link>
    </div>
    <p>This is the home page</p>
    <style jsx>{`
      a {
        margin: 0 10px 0 0;
      }
    `}</style>
  </div>
)
