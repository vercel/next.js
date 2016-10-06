import React, { Component, PropTypes } from 'react'

export default class App extends Component {
  static childContextTypes = {
    router: PropTypes.object,
    headManager: PropTypes.object
  }

  constructor (props) {
    super(props)
    this.state = propsToState(props)
    this.close = null
  }

  componentWillReceiveProps (nextProps) {
    const state = propsToState(nextProps)
    try {
      this.setState(state)
    } catch (err) {
      console.error(err)
    }
  }

  componentDidMount () {
    const { router } = this.props

    this.close = router.subscribe(() => {
      const state = propsToState({
        ...router.currentComponentData,
        router
      })

      try {
        this.setState(state)
      } catch (err) {
        console.error(err)
      }
    })
  }

  componentWillUnmount () {
    if (this.close) this.close()
  }

  getChildContext () {
    const { router, headManager } = this.props
    return { router, headManager }
  }

  render () {
    const { Component, props } = this.state
    return React.createElement(Component, { ...props })
  }
}

function propsToState (props) {
  const { Component, router } = props
  const url = {
    query: router.query,
    pathname: router.pathname,
    back: () => router.back(),
    goTo: (url, fn) => router.goTo(url, fn),
    push: (url, fn) => router.push(Component, url, fn),
    replace: (url, fn) => router.replace(Component, url, fn)
  }

  return {
    Component,
    props: { ...props.props, url }
  }
}
