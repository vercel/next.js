import Link from 'next/link'
import { withRouter } from 'next/router'

export default withRouter(({ router: { asPath, query } }) => {
  return (
    <div id={asPath.replace('/', '').replace('/', '-')}>
      <div id="router-query">{JSON.stringify(query)}</div>
      <div>
        <Link
          href="/nav/as-path-pushstate?something=hello"
          as="/something/hello"
          id="hello"
        >
          hello
        </Link>
      </div>
      <div>
        <Link href="/nav/as-path-pushstate" as="/something/else" id="else">
          else
        </Link>
      </div>
      <div>
        <Link
          href="/nav/as-path-pushstate"
          as="/nav/as-path-pushstate"
          id="hello2"
        >
          normal hello
        </Link>
      </div>
      {query.something === 'hello' && (
        <Link
          href="/nav/as-path-pushstate?something=hello"
          as="/something/same-query"
          id="same-query"
        >
          same query
        </Link>
      )}
    </div>
  )
})
