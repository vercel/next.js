import { parseUrlFromText } from './parse-url-from-text'

describe('parseUrlFromText', () => {
  it('should extract a URL from text', () => {
    const text = 'Check out https://nextjs.org for more info'
    expect(parseUrlFromText(text)).toEqual(['https://nextjs.org'])
  })

  it('should extract multiple URLs from text', () => {
    const text = 'Visit https://react.dev and https://vercel.com'
    expect(parseUrlFromText(text)).toEqual([
      'https://react.dev',
      'https://vercel.com',
    ])
  })

  it('should handle URLs with paths and query parameters', () => {
    const text =
      'Link: https://nextjs.org/docs/getting-started?query=123#fragment'
    expect(parseUrlFromText(text)).toEqual([
      'https://nextjs.org/docs/getting-started?query=123#fragment',
    ])
  })

  it('should return empty array when no URLs are found', () => {
    const text = 'This text contains no URLs'
    expect(parseUrlFromText(text)).toEqual([])
  })

  it('should handle empty string input', () => {
    expect(parseUrlFromText('')).toEqual([])
  })

  it('should filter URLs using matcherFunc', () => {
    const text = 'Visit https://react.dev and https://vercel.com'
    const matcherFunc = (url: string) => url.includes('vercel')
    expect(parseUrlFromText(text, matcherFunc)).toEqual(['https://vercel.com'])
  })
})
