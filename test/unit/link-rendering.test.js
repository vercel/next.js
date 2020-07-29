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
      React.createElement('a', {}, 'to another page')
    )
    const html = ReactDOM.renderToString(element)
    expect(html).toMatchInlineSnapshot(
      `"<a href=\\"/my-path\\" data-reactroot=\\"\\">to another page</a>"`
    )
  })
})
