/* eslint-env jest */
import React from 'react'
import ReactDOM from 'react-dom/server'
import Image from 'next/image'
import cheerio from 'cheerio'

describe('Image rendering', () => {
  it('should render Image on its own', async () => {
    const element = React.createElement(Image, {
      id: 'unit-image',
      src: '/test.png',
      width: 100,
      height: 100,
      loading: 'eager',
    })
    const html = ReactDOM.renderToString(element)
    const $ = cheerio.load(html)
    const img = $('#unit-image')
    expect(img.attr('id')).toBe('unit-image')
    expect(img.attr('src')).toContain('test.png')
    expect(img.attr('srcset')).toContain('test.png')
  })

  it('should only render noscript element when lazy loading', async () => {
    const element = React.createElement(Image, {
      src: '/test.png',
      width: 100,
      height: 100,
      loading: 'eager',
    })
    const element2 = React.createElement(Image, {
      src: '/test.png',
      width: 100,
      height: 100,
      priority: true,
    })
    const elementLazy = React.createElement(Image, {
      src: '/test.png',
      width: 100,
      height: 100,
    })
    const $ = cheerio.load(ReactDOM.renderToString(element))
    const $2 = cheerio.load(ReactDOM.renderToString(element2))
    const $lazy = cheerio.load(ReactDOM.renderToString(elementLazy))
    expect($('noscript').length).toBe(0)
    expect($2('noscript').length).toBe(0)
    expect($lazy('noscript').length).toBe(1)
  })
})
