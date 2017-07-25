import React from 'react'
import hoistNonReactStatic from 'hoist-non-react-statics'
import postcss from 'postcss'
import selectorNamespace from 'postcss-selector-namespace'
import postcssJs from 'postcss-js'
import { injectGlobal } from 'styled-components'
import hash from 'object-hash'

let classNames = []
let cachedNamespaces = {}

export function collectStyles() {
  // For SSR
  return classNames
}

export default (...styles) => Component => {
  class Enhanced extends React.Component {
    constructor(props) {
      super(props)
      this.componentId = Math.random()
        .toString(36)
        .replace(/[^a-z]+/g, '')
        .substr(0, 5)
      this.localClassNames = styles.map(this._createStyled)
      classNames = classNames.concat(this.localClassNames)
    }

    _createStyled = css => {
      // Hash content of css for namespace so they can be shared among components
      // Note: adding a prefix because css classname has to start with normal character rather than a number
      let namespace = 'with-styles-' + hash(css)

      if (!(namespace in cachedNamespaces)) {
        let result = postcss()
          .use(selectorNamespace({ namespace: `.${namespace}` }))
          .process(css)
        // For SSR as well
        injectGlobal`
          ${result.css}
        `
        cachedNamespaces[namespace] = cachedNamespaces[namespace] || new Set()
        cachedNamespaces[namespace].add(this.componentId)
      }
      return namespace
    }

    componentWillUpdate = () => {
      // Hot reload will not call the reloaded one so this is useless
    }

    componentWillMount = () => {
      if (process.browser) {
        // Some component will be generated dynamically, so we need this
        this.localClassNames.forEach(namespace => {
          cachedNamespaces[namespace].add(this.componentId)
          document.body.classList.add(namespace)
        })
      }
    }

    componentWillUnmount = () => {
      if (process.browser) {
        // Like ARC in objective C,
        // only remove body class name if no components depends on it
        this.localClassNames.forEach(namespace => {
          cachedNamespaces[namespace].delete(this.componentId)
          if (cachedNamespaces[namespace].size === 0) {
            document.body.classList.remove(namespace)
          }
        })
      }
    }

    render() {
      return <Component {...this.props} />
    }
  }

  Enhanced.displayName = `WithStyles(${Component.displayName})`
  hoistNonReactStatic(Enhanced, Component)
  return Enhanced
}
