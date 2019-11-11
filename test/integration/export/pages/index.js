import Link from 'next/link'
import Router from 'next/router'

function routeToAbout(e) {
  e.preventDefault()
  Router.push('/about')
}

export default () => (
  <div id="home-page">
    <div>
      <Link href="/about">
        <a id="about-via-link">About via Link</a>
      </Link>
      <a href="#" onClick={routeToAbout} id="about-via-router">
        About via Router
      </a>
      <Link href="/counter">
        <a id="counter">Counter</a>
      </Link>
      <Link href="/dynamic?text=cool+dynamic+text">
        <a id="get-initial-props">getInitialProps</a>
      </Link>
      <Link href="/dynamic?text=next+export+is+nice" as="/dynamic/one">
        <a id="dynamic-1">Dynamic 1</a>
      </Link>
      <Link href="/dynamic?text=zeit+is+awesome" as="/dynamic/two">
        <a id="dynamic-2">Dynamic 2</a>
      </Link>
      <Link href="/dynamic?text=zeit+is+awesome#cool">
        <a id="with-hash">With Hash</a>
      </Link>
      <Link href="/dynamic?text=this+file+has+an+extension" as="/file-name.md">
        <a id="path-with-extension">Path with extension</a>
      </Link>
      <Link href="/level1">
        <a id="level1-home-page">Level1 home page</a>
      </Link>
      <Link href="/level1/about">
        <a id="level1-about-page">Level1 about page</a>
      </Link>
      <Link href="/dynamic-imports">
        <a id="dynamic-imports-page">Dynamic imports page</a>
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
