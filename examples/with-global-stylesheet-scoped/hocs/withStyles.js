import React from 'react'
import hoistNonReactStatic from 'hoist-non-react-statics'
import postcss from 'postcss'
import selectorNamespace from 'postcss-selector-namespace'
import postcssJs from 'postcss-js'
import { injectGlobal } from 'styled-components'

let classNames = []

function getDisplayName(WrappedComponent) {
  return WrappedComponent.displayName || WrappedComponent.name || 'Component'
}

export function collectStyles() {
  return classNames
}

export default (...styles) => Component => {
  class Enhanced extends React.Component {
    constructor(props) {
      super(props)
      this._init()
    }

    _init = () => {
      this.namespaceId = Math.random()
        .toString(36)
        .replace(/[^a-z]+/g, '')
        .substr(0, 5)

      styles.map((css) => this._createStyled(this.namespaceId, css))
      classNames = classNames.concat([this.namespaceId])
    }

    _createStyled = (namespaceId, css) => {
      let result = postcss()
        .use(selectorNamespace({ namespace: `.${namespaceId}` }))
        .process(css)
      injectGlobal`
        ${result.css}
      `
    }

    componentWillUpdate = () => {
      // Hot reload will not call the reloaded one so this is useless
    }

    componentWillMount = () => {
      // Some component will be generated dynamically, so we kinda need this
      if (process.browser)
        document.body.classList.add(this.namespaceId)
    }

    componentWillUnmount = () => {
      if (process.browser)
        document.body.classList.remove(this.namespaceId)
    }

    render() {
      return <Component {...this.props} />
    }
  }

  Enhanced.displayName = `WithStyles(${getDisplayName(Component)})`
  hoistNonReactStatic(Enhanced, Component)
  return Enhanced
}
