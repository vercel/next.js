/* eslint-env jest */
import { getFileNameWithExtension } from 'next/dist/server/image-optimizer'

describe('getFileNameWithExtension', () => {
  it('should return undefined when no url', () => {
    expect(getFileNameWithExtension('', 'image/png')).toBeUndefined()
  })
  it('should return undefined when no contentType', () => {
    expect(getFileNameWithExtension('path/to/file')).toBeUndefined()
  })
  it('should return file name when url and contentType are present', () => {
    const result = getFileNameWithExtension('path/to/file.png', 'image/png')
    expect(result).toBe('file.png')
  })
  it('should return file name correctly when it has no path', () => {
    const result = getFileNameWithExtension('file.webp', 'image/webp')
    expect(result).toBe('file.webp')
  })
  it('should return file name correctly when file name has dots', () => {
    const result = getFileNameWithExtension(
      'path/to/file.name.with.dots.gif',
      'image/gif'
    )
    expect(result).toBe('file.name.with.dots.gif')
  })
  it('should return file name without query params', () => {
    const result = getFileNameWithExtension(
      'path/to/file.jpg?foo=bar&param=1',
      'image/jpeg'
    )
    expect(result).toBe('file.jpeg')
  })
})
