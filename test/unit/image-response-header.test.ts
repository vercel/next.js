/* eslint-env jest */
import { ImageResponse } from 'next/og'
import React from 'react'

describe('new ImageResponse()', () => {
  it('should merge headers correctly', () => {
    const exactHeader = 'public, max-age=3600, s-maxage=3600'
    const res = new ImageResponse(
      React.createElement(
        'div',
        { style: { width: 10, height: 10 } },
        'ImageResponse'
      ),
      {
        width: 10,
        height: 10,
        headers: {
          'Cache-Control': exactHeader,
        },
      }
    )
    expect(res.headers.get('Cache-Control')).toBe(exactHeader)
  })
  it('should have default Cache-Control header', () => {
    const res = new ImageResponse(
      React.createElement(
        'div',
        { style: { width: 10, height: 10 } },
        'ImageResponse'
      ),
      {
        width: 10,
        height: 10,
      }
    )
    expect(res.headers.get('Cache-Control')).toBeTruthy()
  })
})
