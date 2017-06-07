import React from 'react'
import withPage from '../hocs/withPage'
import Clock from '../components/Clock'
import LocalCounter, {reducer as localCounterReducer} from '../components/LocalCounter'
import GlobalCounter from '../components/GlobalCounter'
import Link from 'next/link'

class IndexPage extends React.Component {
  /**
   * The hoc `withRedux` reads
   * from this static method.
   * It allows us to add local reducers to
   * the store. These reducers will be merged
   * on route change
   *
   * @return {Object}
   */
  static getLocalReducers () {
    return {
      localCounter: localCounterReducer
    }
  }

  /**
   * The hoc `withRedux` adds
   * the redux store to the context
   * object of getInitialProps
   *
   * @param  {Object} context
   * @param  {Object} context.store
   * @param  {String} context.pathname
   * @param  {Object} context.query
   * @param  {Object} context.req
   * @param  {Object} context.res
   * @param  {Object} context.jsonPageRes
   * @param  {Object} context.err
   * @return {Promise}
   */
  static getInitialProps ({ store, req, pathname }) {
    store.dispatch({ type: 'TICK', light: !req, ts: Date.now() })
  }

  render () {
    return (
      <div>
        <h1>Index Page</h1>
        <Clock />
        <LocalCounter />
        <GlobalCounter />
        <br />
        <nav>
          <Link href='/other'><a>Navigate</a></Link>
        </nav>
      </div>
    )
  }
}

export default withPage(IndexPage)
