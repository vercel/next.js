import React from 'react'
import {connect} from 'react-redux'

import {loadData, startClock, tickClock} from '../actions'
import Page from '../components/page'

class Index extends React.Component {
  static async getInitialProps (props) {
    const { store, isServer } = props.ctx
    store.dispatch(tickClock(isServer))

    if (!store.getState().placeholderData) {
      store.dispatch(loadData())
    }

    return { isServer }
  }

  componentDidMount () {
    this.props.dispatch(startClock())
  }

  render () {
    return <Page title='Index Page' linkTo='/other' NavigateTo='Other Page' />
  }
}

export default connect()(Index)
