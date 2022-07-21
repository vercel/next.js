/* eslint-env jest */
import React from 'react'
import ReactDOM from 'react-dom/server'
import Link from 'next/link'
import { RouterContext } from 'next/dist/shared/lib/router-context'
import { NextRouter } from 'next/dist/shared/lib/router/router'

describe('Link rendering', () => {
  it('should render Link on its own', async () => {
    const element = React.createElement(
      RouterContext.Provider,
      { value: {} as NextRouter },
      React.createElement(
        Link,
        {
          href: '/my-path',
        },
        React.createElement('a', {}, 'to another page')
      )
    )
    const html = ReactDOM.renderToString(element)
    expect(html).toMatchInlineSnapshot(
      `"<a href=\\"/my-path\\">to another page</a>"`
    )
  })
})
