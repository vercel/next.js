import React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { startClock, serverRenderClock } from '../store'
import Examples from '../components/examples'

class Index extends React.Component {
  static getInitialProps ({ reduxStore, req }) {
    const isServer = !!req
    reduxStore.dispatch(serverRenderClock(isServer))

    return {}
  }

  componentDidMount () {
    const { dispatch } = this.props
    // TO TICK THE CLOCK
    this.timer = setInterval(() => this.props.startClock(dispatch), 1000)
  }

  componentWillUnmount () {
    clearInterval(this.timer)
  }

  render () {
    return <Examples />
  }
}
const mapDispatchToProps = dispatch => bindActionCreators({ startClock }, dispatch)
export default connect(null, mapDispatchToProps)(Index)
