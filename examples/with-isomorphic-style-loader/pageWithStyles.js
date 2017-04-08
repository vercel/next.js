import React, { Component, PropTypes } from 'react'

export default function pageWithStyles (WrappedComponent) {
  class PageWithStyles extends Component {
    static getInitialProps ({ req }) {
      return { isServer: !!req }
    }

    getChildContext () {
      return {
        insertCss: (...styles) => {
          styles.forEach((style) => {
            const cssText = style._getCss()
            if (!~this.props.css.indexOf(cssText)) {
              this.props.css.push(cssText)
            }
          })
        }
      }
    }

    render () {
      return (
        <div>
          <WrappedComponent {...this.props} />
          <style
            className='_isl-styles'
            dangerouslySetInnerHTML={{ __html: this.props.css.join('') }}
          />
        </div>
      )
    }
  }

  PageWithStyles.defaultProps = {
    css: []
  }

  PageWithStyles.childContextTypes = {
    insertCss: PropTypes.func
  }

  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'
  PageWithStyles.displayName = `PageWithStyles(${displayName})`

  return PageWithStyles
}
