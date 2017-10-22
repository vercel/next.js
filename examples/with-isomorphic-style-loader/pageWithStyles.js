import React, { Component } from 'react'
import PropTypes from 'prop-types'

export default function pageWithStyles (WrappedComponent) {
  class PageWithStyles extends Component {
    getChildContext () {
      const insertCss = typeof window === 'undefined'
        ? (...styles) => {
          styles.forEach((style) => {
            const cssText = style._getCss()
            if (!~this.props.css.indexOf(cssText)) {
              this.props.css.push(cssText)
            }
          })
        }
        : (...styles) => {
          const removeCss = styles.map(x => x._insertCss())

          return () => { removeCss.forEach(f => f()) }
        }
      return { insertCss }
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
