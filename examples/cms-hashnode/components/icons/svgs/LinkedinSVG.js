import React from 'react'

export default class LinkedinSVG extends React.Component {
  render() {
    return (
      <svg className={this.props.className} fill="none" viewBox="0 0 24 24">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M16 16v-3a2 2 0 1 0-4 0v3-5m-4 5v-5m.4-3.1a.4.4 0 0 1-.8 0m.8 0a.4.4 0 0 0-.8 0m.8 0h-.8M6 21h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3Z"
        />
      </svg>
    )
  }
}
