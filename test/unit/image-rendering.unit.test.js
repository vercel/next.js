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
    expect(img.attr('src')).toContain('/_next/image?url=%2Ftest.png')
    expect(img.attr('srcset')).toContain('/_next/image?url=%2Ftest.png')
  })
})
