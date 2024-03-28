import React from 'react'

export default class RssSVG extends React.Component {
  render() {
    return (
      <svg className={this.props.className} fill="none" viewBox="0 0 24 24">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M4 4a16 16 0 0 1 16 16M4 11a9 9 0 0 1 9 9m-9-1a1 1 0 1 1 2 0m-2 0a1 1 0 1 0 2 0m-2 0h2"
        />
      </svg>
    )
  }
}
