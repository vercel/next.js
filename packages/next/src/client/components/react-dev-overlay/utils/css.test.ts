import { css } from './css'

describe('css template literal tag', () => {
  test('combines strings and interpolations correctly', () => {
    const color = 'red'
    const result = css`
      color: ${color};
      background: blue;
    `
    expect(result).toBe('color:red;background:blue;')
  })

  test('removes all whitespace', () => {
    const result = css`
      margin: 0;
      padding: 10px;
    `
    expect(result).toBe('margin:0;padding:10px;')
  })

  test('removes CSS comments', () => {
    const result = css`
      color: blue; /* this is a comment */
      /* multi-line
         comment */
      /** jsdoc */
      margin: 10px;
    `
    expect(result).toBe('color:blue;margin:10px;')
  })

  test('handles multiple interpolations', () => {
    const width = '100px'
    const height = '200px'
    const result = css`
      width: ${width};
      height: ${height};
      color: blue; /* this is a comment */
      /* multi-line
         comment */
      /** jsdoc */
    `
    expect(result).toBe('width:100px;height:200px;color:blue;')
  })

  test('handles empty strings', () => {
    const result = css``
    expect(result).toBe('')
  })

  test('handles CSS wildcard selector', () => {
    const result = css`
      * {
        margin: 0;
        padding: 0;
      }
    `
    expect(result).toBe('*{margin:0;padding:0}')
  })
})
