import React from 'react'

export default class HashnodeSVG extends React.Component {
  render() {
    return (
      <svg className={this.props.className} fill="none" viewBox="0 0 24 24">
        <path
          stroke="currentColor"
          strokeWidth="1.5"
          d="M7.314 4.97c1.64-1.64 2.461-2.46 3.407-2.767a4.143 4.143 0 0 1 2.56 0c.946.307 1.766 1.127 3.407 2.768l2.341 2.341c1.64 1.64 2.46 2.46 2.768 3.407.27.832.27 1.728 0 2.56-.307.946-1.127 1.766-2.768 3.407l-2.343 2.343c-1.64 1.64-2.461 2.46-3.407 2.768-.832.27-1.728.27-2.56 0-.946-.307-1.766-1.127-3.407-2.768l-2.341-2.341c-1.64-1.64-2.46-2.46-2.768-3.407a4.143 4.143 0 0 1 0-2.56C2.51 9.775 3.33 8.955 4.97 7.314l2.343-2.343Z"
        />
        <path
          stroke="currentColor"
          strokeWidth="1.5"
          d="M15.107 12a3.107 3.107 0 1 1-6.214 0 3.107 3.107 0 0 1 6.214 0Z"
        />
      </svg>
    )
  }
}
