import React from 'react'

import {increment, loadData, startClock} from '../actions'
import {withReduxSaga} from '../store'
import Page from '../components/page'

class Counter extends React.Component {
  static async getInitialProps ({store}) {
    store.dispatch(increment())
    if (!store.getState().placeholderData) {
      store.dispatch(loadData())
    }
  }

  componentDidMount () {
    this.props.dispatch(startClock())
  }

  render () {
    return <Page title='Index Page' linkTo='/other' />
  }
}

export default withReduxSaga(Counter)
