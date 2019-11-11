import React, { Component } from 'react'
import Theme from 'react-uwp/Theme'

export class ThemeWrapper extends Component {
  render() {
    const { children, style, ...props } = this.props
    return (
      <Theme
        {...props}
        style={props && props.theme ? props.theme.prepareStyles(style) : void 0}
      >
        {children}
      </Theme>
    )
  }
}

export default ThemeWrapper
