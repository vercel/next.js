import { connect } from 'refnux'
import Link from 'next/link'

import withRefnux from '../helpers/withRefnux'
import getInitialState from '../store/getInitialState'

// actions
import counterIncrement from '../store/counterIncrement'
import setTitle from '../store/setTitle'

const Page2 = connect(
  (state, dispatch) =>
    <div>
      <h3>{state.title}</h3>
      <p>Current state: {JSON.stringify(state, null, 2)}</p>
      <button onClick={() => dispatch(counterIncrement)} >Increment</button>
      <Link href='/page1'><button>go to page 2</button></Link>
    </div>
)

Page2.getInitialProps = async function (context) {
  const {store} = context
  store.dispatch(setTitle('Page 2'))
  return {}
}

export default withRefnux(getInitialState, Page2)
