import React from 'react'
import {connect} from 'react-redux'
import {increment, loadData, startClock, tickClock} from '../actions'
import Page from '../components/page'

class Counter extends React.Component {
  static async getInitialProps (props) {
    const { store } = props.ctx
    store.dispatch(tickClock(props.isServer))
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

export default connect()(Counter)
