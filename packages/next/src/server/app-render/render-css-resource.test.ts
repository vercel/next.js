/* eslint-env jest */
import React from 'react'
import { renderCssResource } from './render-css-resource'

describe('renderCssResource', () => {
  const mockCtx = {
    componentMod: {
      createElement: React.createElement,
      preloadStyle: jest.fn(),
    },
    assetPrefix: '',
    sharedContext: {},
    nonce: 'test-nonce',
    renderOpts: {
      crossOrigin: 'anonymous',
    },
    parsedRequestHeaders: {
      isRSCRequest: false,
    },
  } as any

  it('should emit preload link hint followed by stylesheet link for external CSS', () => {
    const entryCssFiles = [
      {
        path: 'static/css/app.css',
        inlined: false,
      },
    ]

    const elements = renderCssResource(entryCssFiles, mockCtx) as React.ReactElement[]
    expect(elements).toHaveLength(2)

    // First element must be preload hint
    const preloadLink = elements[0]
    expect(preloadLink.props.rel).toBe('preload')
    expect(preloadLink.props.as).toBe('style')
    expect(preloadLink.props.href).toContain('static/css/app.css')
    expect(preloadLink.props.crossOrigin).toBe('anonymous')
    expect(preloadLink.props.nonce).toBe('test-nonce')

    // Second element must be the stylesheet
    const stylesheetLink = elements[1]
    expect(stylesheetLink.props.rel).toBe('stylesheet')
    expect(stylesheetLink.props.href).toContain('static/css/app.css')
    expect(stylesheetLink.props.crossOrigin).toBe('anonymous')
    expect(stylesheetLink.props.nonce).toBe('test-nonce')
  })

  it('should render only style tag without preload for inlined CSS', () => {
    const entryCssFiles = [
      {
        path: 'static/css/inlined.css',
        inlined: true,
        content: 'body { margin: 0; }',
      },
    ]

    const elements = renderCssResource(entryCssFiles, mockCtx) as React.ReactElement[]
    expect(elements).toHaveLength(1)
    expect(elements[0].type).toBe('style')
    expect(elements[0].props.children).toBe('body { margin: 0; }')
  })
})
