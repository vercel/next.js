import React from 'react'
import { bindActionCreators } from 'redux'
import {connect} from 'react-redux'
import { startClock, addCount, serverRenderClock } from '../store'
import Page from '../components/Page'

class Counter extends React.Component {
  static getInitialProps ({ reduxStore, req }) {
    const isServer = !!req
    reduxStore.dispatch(serverRenderClock(isServer))
    reduxStore.dispatch(addCount())

    return {}
  }

  componentDidMount () {
    this.timer = this.props.startClock()
  }

  componentWillUnmount () {
    clearInterval(this.timer)
  }

  render () {
    return (
      <Page title='Index Page' />
    )
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    addCount: bindActionCreators(addCount, dispatch),
    startClock: bindActionCreators(startClock, dispatch)
  }
}

export default connect(null, mapDispatchToProps)(Counter)
