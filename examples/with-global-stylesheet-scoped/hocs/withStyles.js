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
    }

    _createStyled = async (css) => {
      let namespaceId = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5)
      let result = await postcss().use(selectorNamespace({ namespace: `.${namespaceId}` })).process(css)
      injectGlobal`
        ${result.css}
      `

      return namespaceId
    }

    componentWillMount = async () => {
      if (!this.localClassNames) {
        this.localClassNames = await Promise.all(styles.map(this._createStyled))
        classNames = classNames.concat(this.localClassNames)
      }

      if (process.browser)
        this.localClassNames.forEach(className =>
          document.body.classList.add(className)
        )
    }

    componentWillUnmount = () => {
      if (process.browser)
        this.localClassNames.forEach(className =>
          document.body.classList.remove(className)
        )
    }

    render() {
      return <Component ref="component" {...this.props} />
    }
  }

  Enhanced.displayName = `WithStyles(${getDisplayName(Component)})`
  hoistNonReactStatic(Enhanced, Component)
  return Enhanced
}
