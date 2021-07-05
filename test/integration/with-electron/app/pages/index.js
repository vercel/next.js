import Link from 'next/link'
import Router from 'next/router'

function routeToAbout(e) {
  e.preventDefault()
  Router.push('/about')
}

const Index = () => (
  <div id="home-page">
    <p>This is the home page</p>
    <Link href="/about">
      <a id="about-via-link">about via Link</a>
    </Link>
    <a id="about-via-router" onClick={routeToAbout} href="#">
      about via Router
    </a>
  </div>
)

export default Index
