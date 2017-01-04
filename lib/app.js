import React, { Component, PropTypes } from 'react'
import { AppContainer } from 'react-hot-loader'
import { warn } from './utils'

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
      this.handleError(err)
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
        this.handleError(err)
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

    return <AppContainer>
      <Component {...props} />
    </AppContainer>
  }

  async handleError (err) {
    console.error(err)

    const { router, ErrorComponent } = this.props
    const { pathname, query } = router
    const props = await ErrorComponent.getInitialProps({ err, pathname, query })
    const state = propsToState({ Component: ErrorComponent, props, router })

    try {
      this.setState(state)
    } catch (err2) {
      console.error(err2)
    }
  }
}

function propsToState (props) {
  const { Component, router } = props
  const url = {
    query: router.query,
    pathname: router.pathname,
    back: () => router.back(),
    push: (url, as) => router.push(url, as),
    pushTo: (href, as) => {
      warn(`Warning: 'url.pushTo()' is deprecated. Please use 'url.push()' instead.`)
      const pushRoute = as ? href : null
      const pushUrl = as || href

      return router.push(pushRoute, pushUrl)
    },
    replace: (url, as) => router.replace(url, as),
    replaceTo: (href, as) => {
      warn(`Warning: 'url.replaceTo()' is deprecated. Please use 'url.replace()' instead.`)
      const replaceRoute = as ? href : null
      const replaceUrl = as || href

      return router.replace(replaceRoute, replaceUrl)
    }
  }

  return {
    Component,
    props: { ...props.props, url }
  }
}
