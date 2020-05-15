import React, { useEffect } from 'react'
import { bindActionCreators } from 'redux'
import { addCount } from '../store/count/action'
import { startClock, serverRenderClock } from '../store/tick/action'
import { connect } from 'react-redux'
import Page from '../components/Page'
import { wrapper } from '../store/store'

const Counter = props => {
  useEffect(() => {
    const timer = props.startClock()

    return () => {
      clearInterval(timer)
    }
  }, [props])

  return <Page title="Index Page" linkTo="/other" />
}

export const getStaticProps = wrapper.getStaticProps(async ({ store }) => {
  store.dispatch(serverRenderClock(true))
  store.dispatch(addCount())
})

const mapDispatchToProps = dispatch => {
  return {
    addCount: bindActionCreators(addCount, dispatch),
    startClock: bindActionCreators(startClock, dispatch),
  }
}

export default wrapper.withRedux(connect(null, mapDispatchToProps)(Counter))
