import React from 'react'

import {increment, startClock, tickClock} from '../actions'
import {withReduxSaga} from '../store'
import Page from '../components/page'

class Counter extends React.Component {
  static async getInitialProps ({store, isServer}) {
    store.dispatch(tickClock(isServer))
    store.dispatch(increment())
  }

  componentDidMount () {
    this.props.dispatch(startClock())
  }

  render () {
    return <Page title='Other Page' linkTo='/' />
  }
}

export default withReduxSaga(Counter)
