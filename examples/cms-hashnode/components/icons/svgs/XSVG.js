import React from 'react'

export default class XSVG extends React.Component {
  render() {
    return (
      <svg className={this.props.className} fill="none" viewBox="0 0 24 24">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
          d="M10.643 13.346 4.269 4.869a.827.827 0 0 1 .661-1.325l2.288.001c.258 0 .501.12.658.326l5.03 6.596m-2.263 2.879-5.45 7.163m5.45-7.163 5.16 6.731a.827.827 0 0 0 .654.324l2.335.007a.827.827 0 0 0 .662-1.328l-6.548-8.612m0 0 5.312-6.959"
        />
      </svg>
    )
  }
}
