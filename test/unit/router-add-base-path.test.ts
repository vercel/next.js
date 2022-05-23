/* eslint-env jest */
import { addBasePath } from 'next/dist/shared/lib/router/router'

describe('router addBasePath', () => {
  it('should add basePath correctly when no basePath', () => {
    const result = addBasePath('/hello')
    expect(result).toBe('/hello')
  })
})
