import Link from 'next/link'
import {withRouter} from 'next/router'

export default withRouter(({router: {asPath, query}}) => {
  return <div id={asPath.replace('/', '').replace('/', '-')}>
    <div id='router-query'>{JSON.stringify(query)}</div>
    <div>
      <Link href='/nav/as-path-pushstate?something=hello' as='/something/hello'>
        <a id='hello'>hello</a>
      </Link>
    </div>
    <div>
      <Link href='/nav/as-path-pushstate' as='/something/else'>
        <a id='else'>else</a>
      </Link>
    </div>
    <div>
      <Link href='/nav/as-path-pushstate' as='/nav/as-path-pushstate'>
        <a id='hello2'>normal hello</a>
      </Link>
    </div>
    {query.something === 'hello' && <Link href='/nav/as-path-pushstate?something=hello' as='/something/same-query'>
      <a id='same-query'>same query</a>
    </Link>}
  </div>
})
