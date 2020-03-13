import { connect } from 'refnux'
import Link from 'next/link'

import withRefnux from '../helpers/withRefnux'
import getInitialState from '../store/getInitialState'

// actions
import counterIncrement from '../store/counterIncrement'
import setTitle from '../store/setTitle'

const Page1 = connect((state, dispatch) => (
  <div>
    <h3>{state.title}</h3>
    <p>Current state: {JSON.stringify(state, null, 2)}</p>
    <button onClick={() => dispatch(counterIncrement)}>Increment</button>
    <Link href="/page2">
      <button>go to page 2</button>
    </Link>
  </div>
))

Page1.getInitialProps = async function(context) {
  const { store } = context
  // dispatch actions to store to set it up for this page / route
  store.dispatch(setTitle('Page 1'))
  return {} // we have a store, we don't need props!
}

export default withRefnux(getInitialState, Page1)
