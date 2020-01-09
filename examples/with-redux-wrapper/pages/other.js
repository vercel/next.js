import React, { useEffect } from 'react'
import { bindActionCreators } from 'redux'
import { addCount } from '../store/count/action'
import { startClock, serverRenderClock } from '../store/tick/action'
import { connect } from 'react-redux'
import Page from '../components/Page'

const Counter = props => {
  useEffect(() => {
    const timer = props.startClock()

    return () => {
      clearInterval(timer)
    }
  }, [props])

  return <Page title="Other Page" linkTo="/" />
}

Counter.getInitialProps = async ({ store, isServer }) => {
  store.dispatch(serverRenderClock(isServer))
  store.dispatch(addCount())
  return { isServer }
}

const mapDispatchToProps = dispatch => {
  return {
    addCount: bindActionCreators(addCount, dispatch),
    startClock: bindActionCreators(startClock, dispatch),
  }
}

export default connect(null, mapDispatchToProps)(Counter)
