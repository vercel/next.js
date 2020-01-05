import React, { useEffect } from 'react'
import { bindActionCreators } from 'redux'
import { startClock, addCount, serverRenderClock } from '../store'
import { connect } from 'react-redux'
import Page from '../components/Page'

const Counter = props => {
  useEffect(() => {
    const timer = props.startClock()

    return () => {
      clearInterval(timer)
    }
  }, [])

  return (
    <Page title='Index Page' linkTo='/other' />
  )
}

Counter.getInitialProps = async ({ store, isServer }) => {
  store.dispatch(serverRenderClock(isServer))
  store.dispatch(addCount())
  return { isServer }
}

const mapDispatchToProps = dispatch => {
  return {
    addCount: bindActionCreators(addCount, dispatch),
    startClock: bindActionCreators(startClock, dispatch)
  }
}

export default connect(
  null,
  mapDispatchToProps
)(Counter)
