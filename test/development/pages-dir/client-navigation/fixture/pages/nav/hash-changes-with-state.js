import React, { Component } from 'react'
import Router from 'next/router'

let count = 0

export default class SelfReload extends Component {
  static getInitialProps({ res }) {
    if (res) return { count: 0 }
    count += 1

    return { count }
  }

  handleAClick = () => {
    Router.push(
      '/nav/hash-changes-with-state',
      '/nav/hash-changes-with-state#hello' + Math.random(),
      {
        historyCount: (window.history.state?.options?.historyCount || 0) + 1,
        shallowHistoryCount: window.history.state?.options?.shallowHistoryCount,
      }
    )
  }

  handleAShallowClick = () => {
    Router.push(
      '/nav/hash-changes-with-state#',
      '/nav/hash-changes-with-state#hello' + Math.random(),
      {
        shallow: true,
        historyCount: window.history.state?.options?.historyCount,
        shallowHistoryCount:
          (window.history.state?.options?.shallowHistoryCount || 0) + 1,
      }
    )
  }

  render() {
    return (
      <div id="hash-changes-page">
        <p>COUNT: {this.props.count}</p>
        <a id="increment-history-count" onClick={this.handleAClick}>
          Increment history count
        </a>
        <div id="history-count">
          HISTORY COUNT:{' '}
          {typeof window !== 'undefined' &&
            window.history.state?.options?.historyCount}
        </div>
        <a
          id="increment-shallow-history-count"
          onClick={this.handleAShallowClick}
        >
          Increment shallow history count
        </a>
        <div id="shallow-history-count">
          SHALLOW HISTORY COUNT:{' '}
          {typeof window !== 'undefined' &&
            window.history.state?.options?.shallowHistoryCount}
        </div>
      </div>
    )
  }
}
