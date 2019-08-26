import Link from 'next/link'
import Router from 'next/router'

const href = '/test'
const as = '/test?test=test'

const changeRoute = e => {
  e.preventDefault()
  Router.push(href, as)
}

if (typeof window !== 'undefined') {
  const origWarn = window.console.warn
  window.displayedWarn = false

  window.console.warn = (...args) => {
    window.displayedWarn = args[0]
    origWarn(...args)
  }
}

export default () => (
  <div>
    <Link href={as} as={href}>
      <a id='href'>Href</a>
    </Link>
    <Link href={href} as={as}>
      <a id='as'>As</a>
    </Link>
    <Link href={as} as={as}>
      <a id='same'>Same</a>
    </Link>
    <a id='router' onClick={e => changeRoute(e)}>
      Router
    </a>
  </div>
)
