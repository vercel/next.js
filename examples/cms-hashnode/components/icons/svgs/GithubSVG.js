import React from 'react'

export default class GithubSVG extends React.Component {
  render() {
    return (
      <svg className={this.props.className} fill="none" viewBox="0 0 24 24">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M9.49 18.991c-4.32 1.406-4.32-2.51-6.027-3.013M15.515 21v-3.515c0-1.005.1-1.406-.502-2.009 2.812-.301 5.524-1.406 5.524-6.026a4.62 4.62 0 0 0-1.306-3.214 4.218 4.218 0 0 0-.1-3.214s-1.105-.3-3.515 1.306a12.353 12.353 0 0 0-6.227 0c-2.41-1.607-3.515-1.306-3.515-1.306a4.218 4.218 0 0 0-.1 3.214A4.62 4.62 0 0 0 4.467 9.45c0 4.62 2.711 5.725 5.524 6.026-.603.603-.603 1.205-.503 2.009V21"
        />
      </svg>
    )
  }
}
