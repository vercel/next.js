/* global describe, it, expect */
import { childrenContain } from '../../server/document'

describe('childrenContain type func', () => {
  it('should check correctly if children is an object', async () => {
    expect(await (childrenContain({foo: 'bar', type: 'mytype'}, 'title'))).toBeFalsy()
    expect(await (childrenContain(null))).toBeFalsy()
    expect(await (childrenContain({foo: 'bar', type: 'title'}, 'title'))).toBeTruthy()
  })
  it('should check correctly if children is an array', async () => {
    expect(await (childrenContain([{foo: 'bar', type: 'mytype'}], 'title'))).toBeFalsy()
    expect(await (childrenContain([{foo: 'bar', type: 'mytype'}, {foo: 'bar', type: 'title'}], 'title'))).toBeTruthy()
  })
})
