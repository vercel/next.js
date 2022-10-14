/* eslint-env jest */
import React from 'react'
import ReactDOM from 'react-dom/server'
import Image from 'next/legacy/image'
import cheerio from 'cheerio'

describe('Image Legacy Rendering', () => {
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

  it('should render noscript element when placeholder=blur', async () => {
    const element1 = React.createElement(Image, {
      src: '/test.png',
      width: 100,
      height: 100,
      loading: 'eager',
      placeholder: 'blur',
      blurDataURL: 'data:image/png;base64',
    })
    const element2 = React.createElement(Image, {
      src: '/test.png',
      width: 100,
      height: 100,
      placeholder: 'blur',
      blurDataURL: 'data:image/png;base64',
      loading: 'eager',
    })
    const element3 = React.createElement(Image, {
      src: '/test.png',
      width: 100,
      height: 100,
      placeholder: 'blur',
      blurDataURL: 'data:image/png;base64',
      priority: true,
    })
    const $1 = cheerio.load(ReactDOM.renderToString(element1))
    const $2 = cheerio.load(ReactDOM.renderToString(element2))
    const $3 = cheerio.load(ReactDOM.renderToString(element3))
    expect($1('noscript').length).toBe(1)
    expect($2('noscript').length).toBe(1)
    expect($3('noscript').length).toBe(1)
  })

  it('should render the correct sizes passed when a noscript element is rendered', async () => {
    const element = React.createElement(Image, {
      src: '/test.png',
      width: 100,
      height: 100,
      sizes: '50vw',
    })
    const $ = cheerio.load(ReactDOM.renderToString(element))
    const noscriptImg = $('noscript img')
    expect(noscriptImg.attr('sizes')).toBe('50vw')
    expect(noscriptImg.attr('srcset')).toContain(
      '/_next/image?url=%2Ftest.png&w=384&q=75 384w'
    )
  })
})
