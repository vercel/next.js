import React from 'react'

export default class HamburgerSVG extends React.Component {
  render() {
    return (
      <svg className={this.props.className} fill="none" viewBox="0 0 24 24">
        <path
          stroke="currentColor"
          stroke-linecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M20.989 11.997H3M20.989 18H3M21 6H3"
        />
      </svg>
    )
  }
}
