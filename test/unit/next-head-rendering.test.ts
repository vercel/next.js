/* eslint-env jest */
import Head from 'next/head'
import { HeadManagerContext } from 'next/dist/shared/lib/head-manager-context.shared-runtime'
import React from 'react'
import ReactDOM from 'react-dom/server'

describe('Rendering next/head', () => {
  it('should render outside of Next.js without error', () => {
    const html = ReactDOM.renderToString(
      React.createElement(
        React.Fragment,
        {},
        React.createElement(Head),
        React.createElement('p', {}, 'hello world')
      )
    )
    expect(html).toContain('hello world')
  })

  it('should warn and ignore invalid head tags', () => {
    const updateHead = jest.fn()
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    ReactDOM.renderToString(
      React.createElement(
        HeadManagerContext.Provider,
        {
          value: {
            mountedInstances: new Set(),
            updateHead,
          },
        },
        React.createElement(
          Head,
          {},
          React.createElement('html', { lang: 'en' }),
          React.createElement('title', {}, 'Invalid Head')
        )
      )
    )

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Do not use <html> in next/head')
    )
    expect(updateHead).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'title',
          props: expect.objectContaining({ children: 'Invalid Head' }),
        }),
      ])
    )
    expect(updateHead).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'html' })])
    )

    warnSpy.mockRestore()
  })
})
