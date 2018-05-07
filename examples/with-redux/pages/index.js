import React from 'react'
import {connect} from 'react-redux'
import {startClock, addCount, serverRenderClock} from '../store'
import Examples from '../components/examples'

class Counter extends React.Component {
  static getInitialProps ({ reduxStore, req }) {
    const isServer = !!req
    reduxStore.dispatch(serverRenderClock(isServer))
    reduxStore.dispatch(addCount())

    return {}
  }

  componentDidMount () {
    const {dispatch} = this.props
    this.timer = startClock(dispatch)
  }

  componentWillUnmount () {
    clearInterval(this.timer)
  }

  render () {
    return (
      <Examples />
    )
  }
}

export default connect()(Counter)
