import React from 'react'
import { bindActionCreators } from 'redux'
import { startClock, addCount, serverRenderClock } from '../store'
import Page from '../components/Page'
import { connect } from 'react-redux'

class Counter extends React.Component {
  static getInitialProps ({ store, isServer }) {
    store.dispatch(serverRenderClock(isServer))
    store.dispatch(addCount())
    return { isServer }
  }

  componentDidMount () {
    this.timer = this.props.startClock()
  }

  componentWillUnmount () {
    clearInterval(this.timer)
  }

  render () {
    return (
      <Page title='Other Page' linkTo='/' />
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
