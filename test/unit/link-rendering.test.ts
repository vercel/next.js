/* eslint-env jest */
import React from 'react'
import ReactDOM from 'react-dom/server'
import Link from 'next/link'

describe('Link rendering', () => {
  it('should render Link on its own', async () => {
    const element = React.createElement(
      Link,
      {
        href: '/my-path',
      },
      'to another page'
    )
    const html = ReactDOM.renderToString(element)
    expect(html).toMatchInlineSnapshot(
      `"<a href="/my-path">to another page</a>"`
    )
  })

  it.each([
    ['ws', 'ws://example.com/socket'],
    ['ws:', 'ws://example.com/socket'],
    ['wss', 'wss://example.com/socket'],
    ['wss:', 'wss://example.com/socket'],
    ['http', 'http://example.com/socket'],
    ['https:', 'https://example.com/socket'],
    ['ftp', 'ftp://example.com/socket'],
    ['gopher', 'gopher://example.com/socket'],
    ['file', 'file://example.com/socket'],
    ['news', 'news:example.comsocket'],
    ['sftp', 'sftp:example.comsocket'],
    ['web+https', 'web+https:example.comsocket'],
  ])('should format a URL object with protocol %s', (protocol, href) => {
    const element = React.createElement(
      Link,
      {
        href: { protocol, hostname: 'example.com', pathname: 'socket' },
      },
      'to another page'
    )

    expect(ReactDOM.renderToString(element)).toBe(
      `<a href="${href}">to another page</a>`
    )
  })
})
