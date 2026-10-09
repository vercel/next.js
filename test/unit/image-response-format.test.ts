/* eslint-env jest */
import { ImageResponse } from 'next/og'
import {
  transformImageFormat,
  getImageFormatContentType,
} from 'next/dist/server/og/image-format'
import React from 'react'

// Magic bytes helpers:
// PNG: 89 50 4E 47 (0x89, 'P', 'N', 'G')
// WebP: RIFF ... WEBP (52 49 46 46 ... 57 45 42 50)
// JPEG: FF D8 FF
// AVIF: ftypavif (starts with 00 00 00 ... 'f', 't', 'y', 'p', 'a', 'v', 'i', 'f')

function isPng(buffer: Buffer): boolean {
  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
}

function isWebP(buffer: Buffer): boolean {
  const riff = buffer.subarray(0, 4).toString('ascii')
  const webp = buffer.subarray(8, 12).toString('ascii')
  return riff === 'RIFF' && webp === 'WEBP'
}

function isJpeg(buffer: Buffer): boolean {
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}

function isAvif(buffer: Buffer): boolean {
  const ftyp = buffer.subarray(4, 8).toString('ascii')
  const brand = buffer.subarray(8, 12).toString('ascii')
  return ftyp === 'ftyp' && (brand === 'avif' || brand === 'avis')
}

// 1x1 transparent PNG buffer for testing transformations
const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

describe('ImageResponse Content-Type Headers', () => {
  it('should default to image/png when format is not specified', () => {
    const res = new ImageResponse(
      React.createElement('div', null, 'PNG Image'),
      { width: 100, height: 100 }
    )
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('should set image/png when format is png', () => {
    const res = new ImageResponse(
      React.createElement('div', null, 'PNG Image'),
      { width: 100, height: 100, format: 'png' }
    )
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('should set image/webp when format is webp', () => {
    const res = new ImageResponse(
      React.createElement('div', null, 'WebP Image'),
      { width: 100, height: 100, format: 'webp' }
    )
    expect(res.headers.get('Content-Type')).toBe('image/webp')
  })

  it('should set image/avif when format is avif', () => {
    const res = new ImageResponse(
      React.createElement('div', null, 'AVIF Image'),
      { width: 100, height: 100, format: 'avif' }
    )
    expect(res.headers.get('Content-Type')).toBe('image/avif')
  })

  it('should set image/jpeg when format is jpeg', () => {
    const res = new ImageResponse(
      React.createElement('div', null, 'JPEG Image'),
      { width: 100, height: 100, format: 'jpeg' }
    )
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
  })

  it('should set image/jpeg when format is jpg', () => {
    const res = new ImageResponse(
      React.createElement('div', null, 'JPG Image'),
      { width: 100, height: 100, format: 'jpg' }
    )
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
  })

  it('should allow custom headers to override Content-Type', () => {
    const res = new ImageResponse(
      React.createElement('div', null, 'Custom Header'),
      {
        width: 100,
        height: 100,
        format: 'webp',
        headers: {
          'Content-Type': 'image/custom-webp',
        },
      }
    )
    expect(res.headers.get('Content-Type')).toBe('image/custom-webp')
  })
})

describe('getImageFormatContentType helper', () => {
  it('should return correct MIME types for each format', () => {
    expect(getImageFormatContentType('png')).toBe('image/png')
    expect(getImageFormatContentType('webp')).toBe('image/webp')
    expect(getImageFormatContentType('avif')).toBe('image/avif')
    expect(getImageFormatContentType('jpeg')).toBe('image/jpeg')
    expect(getImageFormatContentType('jpg')).toBe('image/jpeg')
    expect(getImageFormatContentType(undefined)).toBe('image/png')
  })
})

describe('transformImageFormat helper with sharp', () => {
  it('should return unchanged buffer for png without quality option', async () => {
    const transformed = await transformImageFormat(SAMPLE_PNG, 'png')
    expect(isPng(transformed)).toBe(true)
  })

  it('should transform PNG to WebP', async () => {
    const transformed = await transformImageFormat(SAMPLE_PNG, 'webp', 80)
    expect(isWebP(transformed)).toBe(true)
  })

  it('should transform PNG to AVIF', async () => {
    const transformed = await transformImageFormat(SAMPLE_PNG, 'avif', 75)
    expect(isAvif(transformed)).toBe(true)
  })

  it('should transform PNG to JPEG', async () => {
    const transformed = await transformImageFormat(SAMPLE_PNG, 'jpeg', 85)
    expect(isJpeg(transformed)).toBe(true)
  })

  it('should transform PNG to JPG', async () => {
    const transformed = await transformImageFormat(SAMPLE_PNG, 'jpg')
    expect(isJpeg(transformed)).toBe(true)
  })

  it('should reject invalid format', async () => {
    await expect(
      // @ts-expect-error invalid format test
      transformImageFormat(SAMPLE_PNG, 'invalid')
    ).rejects.toThrow(/Unsupported image format "invalid"/)
  })
})
