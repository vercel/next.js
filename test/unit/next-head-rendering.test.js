/* eslint-env jest */
import Head from 'next/head'
import React from 'react'
import ReactDOM from 'react-dom/server'

describe('Rendering next/head', () => {
  it('should render outside of Next.js without error', () => {
    const html = ReactDOM.renderToString(
      React.createElement(
        React.Fragment,
        {},
        React.createElement(Head, {}),
        React.createElement('p', {}, 'hello world')
      )
    )
    expect(html).toContain('hello world')
  })
})
