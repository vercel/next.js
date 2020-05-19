import React, { PureComponent } from 'react'
import { connect } from 'react-redux'
import Link from 'next/link'
import { startClock, serverRenderClock } from '../actions'
import Examples from '../components/examples'

class Index extends PureComponent {
  static getInitialProps({ store, req }) {
    store.dispatch(serverRenderClock(!!req))

    return {}
  }

  componentDidMount() {
    this.timer = this.props.startClock()
  }

  componentWillUnmount() {
    clearInterval(this.timer)
  }

  render() {
    return (
      <>
        <Examples />
        <Link href="/show-redux-state">
          <a>Click to see current Redux State</a>
        </Link>
      </>
    )
  }
}

const mapDispatchToProps = {
  startClock,
}

export default connect(null, mapDispatchToProps)(Index)
