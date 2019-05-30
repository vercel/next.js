import Link from 'next/link'
import { withRouter } from 'next/router'

export default withRouter(({ router: { asPath, query } }) => {
  return (
    <div
      id={asPath
        .replace('/', '')
        .replace('/', '-')
        .replace('?', '-')
        .replace('=', '-')}
    >
      <div id='router-query'>{JSON.stringify(query)}</div>
      <div>
        <Link
          href='/nav/as-path-query?something=hello'
          as='/something/hello?something=hello'
        >
          <a id='hello'>hello</a>
        </Link>
      </div>
      <div>
        <Link
          href='/nav/as-path-query?something=else'
          as='/something/hello?something=else'
        >
          <a id='hello2'>hello</a>
        </Link>
      </div>
    </div>
  )
})
