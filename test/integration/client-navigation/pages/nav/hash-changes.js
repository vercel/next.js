import React, { Component } from 'react'
import Link from 'next/link'
import Router from 'next/router'

let count = 0

export default class SelfReload extends Component {
  static getInitialProps({ res }) {
    if (res) return { count: 0 }
    count += 1

    return { count }
  }

  handleAClick = () => {
    Router.push('/nav/hash-changes', '/nav/hash-changes#', {
      historyCount: (window.history.state.options.historyCount || 0) + 1,
      shallowHistoryCount: window.history.state.options.shallowHistoryCount,
    })
  }

  handleAShallowClick = () => {
    Router.push('/nav/hash-changes#', '/nav/hash-changes#', {
      shallow: true,
      historyCount: window.history.state.options.historyCount,
      shallowHistoryCount:
        (window.history.state.options.shallowHistoryCount || 0) + 1,
    })
  }

  render() {
    return (
      <div id="hash-changes-page">
        <Link href="#via-link">
          <a id="via-link">Via Link</a>
        </Link>
        <a href="#via-a" id="via-a">
          Via A
        </a>
        <Link href="/nav/hash-changes">
          <a id="page-url">Page URL</a>
        </Link>
        <Link href="#">
          <a id="via-empty-hash">Via Empty Hash</a>
        </Link>
        <Link href="#item-400">
          <a id="scroll-to-item-400">Go to item 400</a>
        </Link>
        <Link href="#name-item-400">
          <a id="scroll-to-name-item-400">Go to name item 400</a>
        </Link>
        <p>COUNT: {this.props.count}</p>
        <a id="increment-history-count" onClick={this.handleAClick}>
          Increment history count
        </a>
        <div id="history-count">
          HISTORY COUNT:{' '}
          {typeof window !== 'undefined' &&
            window.history.state.options.historyCount}
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
            window.history.state.options.shallowHistoryCount}
        </div>
        {Array.from({ length: 500 }, (x, i) => i + 1).map(i => {
          return (
            <div key={`item-${i}`} id={`item-${i}`}>
              {i}
            </div>
          )
        })}
        {Array.from({ length: 500 }, (x, i) => i + 1).map(i => {
          return (
            <div key={`item-${i}`} name={`name-item-${i}`}>
              {i}
            </div>
          )
        })}
      </div>
    )
  }
}
