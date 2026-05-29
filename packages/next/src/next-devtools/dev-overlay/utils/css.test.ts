import { css } from './css'

describe('css template literal tag', () => {
  it('should combines strings and interpolations correctly', () => {
    const color = 'red'
    const result = css`
      color: ${color};
      background: blue;
    `
    expect(result).toBe('color:red;background:blue;')
  })

  it('should remove all whitespace', () => {
    const result = css`
      margin: 0;
      padding: 10px;
    `
    expect(result).toBe('margin:0;padding:10px;')
  })

  it('should remove CSS comments', () => {
    const result = css`
      color: blue; /* this is a comment */
      /* multi-line
         comment */
      /** jsdoc */
      margin: 10px;
    `
    expect(result).toBe('color:blue;margin:10px;')
  })

  it('should remove multiline comments', () => {
    const result = css`
      color: blue;
      /*
       * This is multi-line comment.
       * Is should be removed.
       */
      margin: 10px;
    `
    expect(result).toBe('color:blue;margin:10px;')
  })

  it('should handle multiple interpolations', () => {
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

  it('should handle empty strings', () => {
    const result = css``
    expect(result).toBe('')
  })

  it('should handle CSS wildcard selector', () => {
    const result = css`
      * {
        margin: 0;
        padding: 0;
      }
    `
    expect(result).toBe('*{margin:0;padding:0}')
  })
})
