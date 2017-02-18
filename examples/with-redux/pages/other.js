import React from 'react'
import { nextConnect, reducer, startClock, setPageTitle } from '../store'
import Page from '../components/Page'

class Counter extends React.Component {
  static getInitialProps ({ store, isServer }) {
    store.dispatch({ type: 'TICK', light: !isServer, ts: Date.now() })
    store.dispatch({ type: 'SET_PAGE_TITLE', title: 'Other Page' })
    return { isServer }
  }

  componentDidMount () {
    this.timer = this.props.dispatch(startClock())
  }

  componentWillUnmount () {
    clearInterval(this.timer)
  }

  render () {
    return (
      <Page title={this.props.title} linkTo='/' />
    )
  }
}

export default nextConnect((state) => state)(Counter)
