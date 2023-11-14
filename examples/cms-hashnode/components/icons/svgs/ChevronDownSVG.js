import React from 'react'

export default class ChevronDownSVG extends React.Component {
  render() {
    return (
      <svg className={this.props.className} fill="none" viewBox="0 0 24 24">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="m6 10 6 6 6-6"
        />
      </svg>
    )
  }
}
