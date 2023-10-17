/* eslint-env jest */
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import Image from 'next/image'
import cheerio from 'cheerio'

// Since this unit test doesn't check the result of
// ReactDOM.preload(), we can turn it into a noop.
jest.mock('react-dom', () => ({ preload: () => null }))

describe('Image rendering', () => {
  it('should render Image on its own', async () => {
    const element = React.createElement(Image, {
      alt: 'a nice image',
      id: 'unit-image',
      src: '/test.png',
      width: 100,
      height: 100,
      loading: 'eager',
    })
    const html = ReactDOMServer.renderToString(element)
    const $ = cheerio.load(html)
    const img = $('#unit-image')
    // order matters here
    expect(img.attr()).toStrictEqual({
      alt: 'a nice image',
      id: 'unit-image',
      loading: 'eager',
      width: '100',
      height: '100',
      decoding: 'async',
      'data-nimg': '1',
      style: 'color:transparent',
      srcset:
        '/_next/image?url=%2Ftest.png&w=128&q=75 1x, /_next/image?url=%2Ftest.png&w=256&q=75 2x',
      src: '/_next/image?url=%2Ftest.png&w=256&q=75',
    })
  })

  it('should only render noscript element when lazy loading', async () => {
    const element = React.createElement(Image, {
      alt: 'test',
      src: '/test.png',
      width: 100,
      height: 100,
      loading: 'eager',
    })
    const element2 = React.createElement(Image, {
      alt: 'test',
      src: '/test.png',
      width: 100,
      height: 100,
      priority: true,
    })
    const elementLazy = React.createElement(Image, {
      alt: 'test',
      src: '/test.png',
      width: 100,
      height: 100,
    })
    const $ = cheerio.load(ReactDOMServer.renderToString(element))
    const $2 = cheerio.load(ReactDOMServer.renderToString(element2))
    const $lazy = cheerio.load(ReactDOMServer.renderToString(elementLazy))
    expect($('noscript').length).toBe(0)
    expect($2('noscript').length).toBe(0)
    expect($lazy('noscript').length).toBe(0)
  })

  it('should not render noscript', async () => {
    const element1 = React.createElement(Image, {
      alt: 'test',
      src: '/test.png',
      width: 100,
      height: 100,
      loading: 'eager',
      placeholder: 'blur',
      blurDataURL: 'data:image/png;base64',
    })
    const element2 = React.createElement(Image, {
      alt: 'test',
      src: '/test.png',
      width: 100,
      height: 100,
      placeholder: 'blur',
      blurDataURL: 'data:image/png;base64',
      loading: 'eager',
    })
    const element3 = React.createElement(Image, {
      alt: 'test',
      src: '/test.png',
      width: 100,
      height: 100,
      placeholder: 'blur',
      blurDataURL: 'data:image/png;base64',
      priority: true,
    })
    const $1 = cheerio.load(ReactDOMServer.renderToString(element1))
    const $2 = cheerio.load(ReactDOMServer.renderToString(element2))
    const $3 = cheerio.load(ReactDOMServer.renderToString(element3))
    expect($1('noscript').length).toBe(0)
    expect($2('noscript').length).toBe(0)
    expect($3('noscript').length).toBe(0)
  })
})
