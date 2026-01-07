import Link from 'next/link'
import Router from 'next/router'

function routeToAbout(e) {
  e.preventDefault()
  Router.push('/about')
}

export default () => (
  <div id="home-page">
    <div>
      <Link href="/about" id="about-via-link">
        About via Link
      </Link>
      <a href="#" onClick={routeToAbout} id="about-via-router">
        About via Router
      </a>
      <Link href="/counter" id="counter">
        Counter
      </Link>
      <Link href="/dynamic?text=cool+dynamic+text" id="get-initial-props">
        getInitialProps
      </Link>
      <Link
        href="/dynamic?text=next+export+is+nice"
        as="/dynamic/one"
        id="dynamic-1"
      >
        Dynamic 1
      </Link>
      <Link
        href="/dynamic?text=Vercel+is+awesome"
        as="/dynamic/two"
        id="dynamic-2"
      >
        Dynamic 2
      </Link>
      <Link href="/dynamic?text=Vercel+is+awesome#cool" id="with-hash">
        With Hash
      </Link>
      <Link
        href="/dynamic?text=this+file+has+an+extension"
        as="/file-name.md"
        id="path-with-extension"
      >
        Path with extension
      </Link>
      <Link href="/level1" id="level1-home-page">
        Level1 home page
      </Link>
      <Link href="/level1/about" id="level1-about-page">
        Level1 about page
      </Link>
      <Link href="/dynamic-imports" id="dynamic-imports-link">
        Dynamic imports page
      </Link>
      <Link href="/gsp-notfound" id="gsp-notfound-link">
        GSP notfound page
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
