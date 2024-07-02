import React from 'react'

export default class ArticleSVG extends React.Component {
  render() {
    return (
      <svg className={this.props.className} fill="none" viewBox="0 0 24 24">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M13.992 3.18V7a1 1 0 0 0 1 1h3.828m-4.828-4.82a2 2 0 0 0-.827-.18H8a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8.83a2 2 0 0 0-.18-.83m-4.828-4.82c.216.097.415.234.586.405l3.835 3.829A2 2 0 0 1 18.82 8M9 12h6m-6 4h6M9 8h2"
        />
      </svg>
    )
  }
}
