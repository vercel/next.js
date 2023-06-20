import { getWordsAndWhitespaces } from './get-words-and-whitespaces'

describe('getWordsAndWhitespaces', () => {
  it('should return sequences of words and whitespaces', () => {
    const text = '  \n\nhello world https://nextjs.org/\nhttps://nextjs.org/'
    expect(getWordsAndWhitespaces(text)).toEqual([
      '  \n\n',
      'hello',
      ' ',
      'world',
      ' ',
      'https://nextjs.org/',
      '\n',
      'https://nextjs.org/',
    ])
  })
})
