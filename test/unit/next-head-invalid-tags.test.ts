/* eslint-env jest */
import Head from 'next/head'
import React from 'react'
import ReactDOM from 'react-dom/server'

describe('next/head invalid tags', () => {
  it('ignores unsupported HTML tags inside Head without throwing', () => {
    const html = ReactDOM.renderToString(
      React.createElement(
        React.Fragment,
        {},
        React.createElement(
          Head,
          {},
          React.createElement('html', {}, 'bad-element'),
          React.createElement('title', {}, 'my-title')
        ),
        React.createElement('p', {}, 'hello world')
      )
    )
    expect(html).toContain('hello world')
    // unsupported <html> should not be rendered inside head flow server-side
    expect(html).not.toContain('bad-element')
  })
})
