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

    this.close = router.subscribe((data) => {
      const props = data.props || this.state.props
      const state = propsToState({
        ...data,
        props,
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
  const { route } = router
  const url = {
    query: router.query,
    pathname: router.pathname,
    back: () => router.back(),
    push: (url) => router.push(route, url),
    pushTo: (url) => router.push(null, url),
    replace: (url) => router.replace(route, url),
    replaceTo: (url) => router.replace(null, url)
  }

  return {
    Component,
    props: { ...props.props, url }
  }
}
