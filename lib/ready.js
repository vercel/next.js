import React, { Component, PropTypes } from 'react'

const DefaultLoadingHandler = () => (<p>Loading...</p>)
const DefaultErrorHandler = ({ error }) => (
  <pre>
    <code style={{ color: 'red' }}>{error.stack}</code>
  </pre>
)

export default class Ready extends Component {
  static contextTypes = {
    router: PropTypes.object
  }

  static propTypes = {
    children: PropTypes.node
  }

  constructor (...args) {
    super(...args)
    this.state = {}
  }

  componentDidMount () {
    const { router } = this.context
    this.removeOnReadyCallback = router.onReady((readyData) => {
      this.setState({ readyData })
    })
  }

  componentWillUnmount () {
    this.removeOnReadyCallback()
  }

  render () {
    const {
      children,
      loadingHandler: LoadingHandler = DefaultLoadingHandler,
      errorHandler: ErrorHandler = DefaultErrorHandler
    } = this.props
    const { readyData } = this.state

    // no ready data means initially. We simply load children
    if (!readyData) return children

    // this is the loading state and we need to render the loading screen
    if (readyData.loading) return (<LoadingHandler />)

    // handle errors
    if (readyData.error) return (<ErrorHandler error={readyData.error} />)

    return children
  }
}
