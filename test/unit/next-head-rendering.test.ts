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
        React.createElement(Head),
        React.createElement('p', {}, 'hello world')
      )
    )
    expect(html).toContain('hello world')
  })

  describe('invalid head tag warnings', () => {
    const originalNodeEnv = process.env.NODE_ENV

    beforeEach(() => {
      ;(process.env as any).NODE_ENV = 'development'
      jest.spyOn(console, 'error').mockImplementation(() => {})
      jest.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      ;(process.env as any).NODE_ENV = originalNodeEnv
      jest.restoreAllMocks()
    })

    it('should warn when an invalid tag is placed inside next/head', () => {
      // Dynamically require warn-once and HeadManagerContext so we can spy on warnOnce and provide headManager
      jest.isolateModules(() => {
        const warnOnceModule = require('next/dist/shared/lib/utils/warn-once')
        const {
          HeadManagerContext,
        } = require('next/dist/shared/lib/head-manager-context.shared-runtime')
        const warnOnceSpy = jest
          .spyOn(warnOnceModule, 'warnOnce')
          .mockImplementation(() => {})

        const headManager = {
          mountedInstances: new Set(),
          updateHead: jest.fn(),
        }

        ReactDOM.renderToString(
          React.createElement(
            HeadManagerContext.Provider,
            { value: headManager },
            React.createElement(
              Head,
              {},
              // <html> is an invalid tag inside <Head>
              React.createElement('html', { lang: 'en' }),
              React.createElement('title', {}, 'Test Page')
            )
          )
        )

        expect(warnOnceSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            '<html> is not a valid element to place inside next/head'
          )
        )
      })
    })

    it('should NOT warn when valid tags are placed inside next/head', () => {
      jest.isolateModules(() => {
        const warnOnceModule = require('next/dist/shared/lib/utils/warn-once')
        const {
          HeadManagerContext,
        } = require('next/dist/shared/lib/head-manager-context.shared-runtime')
        const warnOnceSpy = jest
          .spyOn(warnOnceModule, 'warnOnce')
          .mockImplementation(() => {})

        const headManager = {
          mountedInstances: new Set(),
          updateHead: jest.fn(),
        }

        ReactDOM.renderToString(
          React.createElement(
            HeadManagerContext.Provider,
            { value: headManager },
            React.createElement(
              Head,
              {},
              React.createElement('title', {}, 'Valid Page'),
              React.createElement('meta', {
                name: 'description',
                content: 'ok',
              }),
              React.createElement('link', { rel: 'canonical', href: '/page' })
            )
          )
        )

        // warnOnce should not be called for invalid-head-tag
        const invalidTagCalls = warnOnceSpy.mock.calls.filter((args) =>
          args[0]?.includes('is not a valid element to place inside next/head')
        )
        expect(invalidTagCalls).toHaveLength(0)
      })
    })
  })
})
